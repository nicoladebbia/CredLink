use crate::util::hex_bytes;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProofPath {
    siblings: Vec<[u8; 32]>,
}

impl ProofPath {
    pub fn new(siblings: Vec<[u8; 32]>) -> Self {
        Self { siblings }
    }

    pub fn len(&self) -> usize {
        self.siblings.len()
    }

    pub fn is_empty(&self) -> bool {
        self.siblings.is_empty()
    }

    pub fn as_bytes(&self) -> &[[u8; 32]] {
        &self.siblings
    }

    pub fn to_hex(&self) -> Vec<String> {
        self.siblings
            .iter()
            .map(|sibling| hex_bytes(sibling))
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MerkleProof {
    pub leaf_index: usize,
    pub leaf_hash: [u8; 32],
    pub audit_path: ProofPath,
    pub root: [u8; 32],
}

impl MerkleProof {
    pub fn audit_path_hex(&self) -> Vec<String> {
        self.audit_path.to_hex()
    }

    pub fn root_hex(&self) -> String {
        hex_bytes(&self.root)
    }

    pub fn leaf_hash_hex(&self) -> String {
        hex_bytes(&self.leaf_hash)
    }

    pub fn leaf_index(&self) -> usize {
        self.leaf_index
    }

    pub fn audit_path(&self) -> &ProofPath {
        &self.audit_path
    }
}
