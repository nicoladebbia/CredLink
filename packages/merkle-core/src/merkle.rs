use crate::canonical::ManifestDigest;
use crate::proof::{MerkleProof, ProofPath};
use crate::util::{hex_bytes, parse_digest_hex, HexError};
use sha2::{Digest as ShaDigest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MerkleParameters {
    pub hash_alg: &'static str,
    pub leaf_prefix: &'static str,
    pub pairing: &'static str,
    pub dup_last: bool,
}

impl Default for MerkleParameters {
    fn default() -> Self {
        Self {
            hash_alg: "SHA-256",
            leaf_prefix: "c2c.manifest.v1|",
            pairing: "left-right",
            dup_last: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MerkleTreeSummary {
    pub root_hex: String,
    pub tree_size: usize,
    pub parameters: MerkleParameters,
}

#[derive(Debug, Clone)]
struct LeafEntry {
    digest_hex: String,
    leaf_hash: [u8; 32],
}

#[derive(Debug, Default)]
pub struct MerkleTreeBuilder {
    parameters: MerkleParameters,
    entries: Vec<LeafEntry>,
}

impl MerkleTreeBuilder {
    pub fn new() -> Self {
        Self {
            parameters: MerkleParameters::default(),
            entries: Vec::new(),
        }
    }

    pub fn with_parameters(parameters: MerkleParameters) -> Self {
        Self {
            parameters,
            entries: Vec::new(),
        }
    }

    pub fn push_digest(&mut self, digest: &ManifestDigest) -> Result<(), LeafHashError> {
        let leaf = leaf_hash_with_prefix(digest.as_hex(), self.parameters.leaf_prefix)?;
        self.entries.push(LeafEntry {
            digest_hex: digest.hex.clone(),
            leaf_hash: leaf,
        });
        Ok(())
    }

    pub fn push_digest_hex(&mut self, digest_hex: &str) -> Result<(), LeafHashError> {
        let leaf = leaf_hash_with_prefix(digest_hex, self.parameters.leaf_prefix)?;
        self.entries.push(LeafEntry {
            digest_hex: digest_hex.to_string(),
            leaf_hash: leaf,
        });
        Ok(())
    }

    pub fn extend(&mut self, digests: &[ManifestDigest]) -> Result<(), LeafHashError> {
        for digest in digests {
            self.push_digest(digest)?;
        }
        Ok(())
    }

    pub fn build(&self) -> Result<MerkleTree, MerkleError> {
        if self.entries.is_empty() {
            return Err(MerkleError::EmptyTree);
        }

        let mut entries = self.entries.clone();
        entries.sort_by(|a, b| a.digest_hex.cmp(&b.digest_hex));

        let sorted_digests: Vec<String> = entries.iter().map(|entry| entry.digest_hex.clone()).collect();
        let sorted_leaves: Vec<[u8; 32]> = entries.iter().map(|entry| entry.leaf_hash).collect();

        let mut levels: Vec<Vec<[u8; 32]>> = Vec::new();
        levels.push(sorted_leaves.clone());
        let mut current = sorted_leaves.clone();

        let mut last_level_dup = false;

        while current.len() > 1 {
            let mut next_level = Vec::with_capacity((current.len() + 1) / 2);
            for chunk in current.chunks(2) {
                let parent = match chunk {
                    [left, right] => parent_hash(left, right),
                    [single] => {
                        last_level_dup = true;
                        parent_hash(single, single)
                    }
                    _ => unreachable!("chunks(2) yields 1 or 2 elements"),
                };
                next_level.push(parent);
            }
            levels.push(next_level.clone());
            current = next_level;
        }

        Ok(MerkleTree {
            parameters: self.parameters,
            sorted_digests,
            leaves: sorted_leaves,
            levels,
            last_level_dup,
        })
    }
}

#[derive(Debug, Clone)]
pub struct MerkleTree {
    parameters: MerkleParameters,
    sorted_digests: Vec<String>,
    leaves: Vec<[u8; 32]>,
    levels: Vec<Vec<[u8; 32]>>,
    last_level_dup: bool,
}

impl MerkleTree {
    pub fn new(parameters: MerkleParameters, digests: &[ManifestDigest]) -> Result<Self, MerkleError> {
        let mut builder = MerkleTreeBuilder::with_parameters(parameters);
        builder.extend(digests)?;
        builder.build()
    }

    pub fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    pub fn parameters(&self) -> MerkleParameters {
        self.parameters
    }

    pub fn root(&self) -> Result<[u8; 32], MerkleError> {
        self.levels
            .last()
            .and_then(|level| level.first().copied())
            .ok_or(MerkleError::EmptyTree)
    }

    pub fn root_hex(&self) -> Result<String, MerkleError> {
        Ok(hex_bytes(&self.root()?))
    }

    pub fn summary(&self) -> Result<MerkleTreeSummary, MerkleError> {
        Ok(MerkleTreeSummary {
            root_hex: self.root_hex()?,
            tree_size: self.leaf_count(),
            parameters: self.parameters,
        })
    }

    pub fn proof_by_index(&self, leaf_index: usize) -> Result<MerkleProof, ProofError> {
        if self.leaves.is_empty() {
            return Err(ProofError::EmptyTree);
        }
        if leaf_index >= self.leaves.len() {
            return Err(ProofError::LeafIndexOutOfRange {
                index: leaf_index,
                max: self.leaves.len(),
            });
        }
        let leaf_hash = self.leaves[leaf_index];
        let mut index = leaf_index;
        let mut siblings: Vec<[u8; 32]> = Vec::new();

        for level in &self.levels[..self.levels.len() - 1] {
            let is_right = index % 2 == 1;
            let sibling_index = if is_right {
                index - 1
            } else if index + 1 < level.len() {
                index + 1
            } else {
                index
            };
            siblings.push(level[sibling_index]);
            index /= 2;
        }

        let audit_path = ProofPath::new(siblings);
        let root = self.root()?;
        Ok(MerkleProof {
            leaf_index,
            leaf_hash,
            audit_path,
            root,
        })
    }

    pub fn proof_by_digest(&self, digest_hex: &str) -> Result<MerkleProof, ProofError> {
        if let Some(index) = self
            .sorted_digests
            .iter()
            .position(|candidate| candidate == digest_hex)
        {
            self.proof_by_index(index)
        } else {
            Err(ProofError::DigestNotFound(digest_hex.to_string()))
        }
    }

    pub fn duplicated_last_leaf(&self) -> bool {
        self.last_level_dup
    }
}

#[derive(Debug, Error)]
pub enum MerkleError {
    #[error("merkle tree requires at least one leaf")]
    EmptyTree,
    #[error("leaf hash error: {0}")]
    Leaf(#[from] LeafHashError),
}

#[derive(Debug, Error)]
pub enum LeafHashError {
    #[error("digest hex error: {0}")]
    Hex(#[from] HexError),
}

#[derive(Debug, Error)]
pub enum ProofError {
    #[error("merkle tree is empty")]
    EmptyTree,
    #[error("leaf index {index} out of range (tree has {max} leaves)")]
    LeafIndexOutOfRange { index: usize, max: usize },
    #[error("digest not found in tree: {0}")]
    DigestNotFound(String),
    #[error("root unavailable: {0}")]
    Root(#[from] MerkleError),
}

pub fn build_merkle_tree(digests: &[ManifestDigest]) -> Result<MerkleTree, MerkleError> {
    let builder = {
        let mut builder = MerkleTreeBuilder::new();
        builder.extend(digests)?;
        builder
    };
    builder.build()
}

pub fn leaf_hash(digest_hex: &str) -> Result<[u8; 32], LeafHashError> {
    leaf_hash_with_prefix(digest_hex, MerkleParameters::default().leaf_prefix)
}

fn leaf_hash_with_prefix(digest_hex: &str, leaf_prefix: &str) -> Result<[u8; 32], LeafHashError> {
    let _ = parse_digest_hex(digest_hex)?;
    let mut hasher = Sha256::new();
    hasher.update(leaf_prefix.as_bytes());
    hasher.update(digest_hex.as_bytes());
    Ok(hasher.finalize().into())
}

fn parent_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}
