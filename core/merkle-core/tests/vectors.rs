use merkle_core::{
    build_merkle_tree,
    canonical_json_string,
    canonical_manifest_digest,
    leaf_hash,
    MerkleTreeBuilder,
    CANON_VERSION,
};
use sha2::{Digest, Sha256};

const SAMPLE_MANIFEST_A: &str = r#"
{
  "foo": "bar",
  "nested": { "b": 1, "a": 0 },
  "array": [
    { "z": 1, "a": 2 },
    3
  ]
}
"#;

const SAMPLE_MANIFEST_B: &str = r#"
{
  "foo": "baz",
  "nested": { "b": 2, "a": 1 },
  "array": [
    { "z": 9, "a": 5 },
    10
  ]
}
"#;

#[test]
fn canonicalization_sorts_keys_and_removes_whitespace() {
    let canonical = canonical_json_string(SAMPLE_MANIFEST_A).expect("canonicalization succeeds");
    assert_eq!(
        canonical,
        r#"{"array":[{"a":2,"z":1},3],"foo":"bar","nested":{"a":0,"b":1}}"#
    );
}

#[test]
fn canonical_digest_matches_expected_vector() {
    let digest = canonical_manifest_digest(SAMPLE_MANIFEST_A).expect("digest computed");
    assert_eq!(
        digest.as_hex(),
        "6fe977160e4b69b0e706824d01e5653e6364618462844011116323999146cbbd"
    );
}

#[test]
fn leaf_hash_applies_domain_separation() {
    let digest = "6fe977160e4b69b0e706824d01e5653e6364618462844011116323999146cbbd";
    let leaf = leaf_hash(digest).expect("leaf hash computed");
    assert_eq!(
        hex::encode(leaf),
        "bf0110057dbfd67acbaccc5a50139396c22d16bcaaa21e70bd04626175c3835c"
    );
}

#[test]
fn merkle_root_two_leaves_matches_expected() {
    let manifest_a = canonical_manifest_digest(SAMPLE_MANIFEST_A).unwrap();
    let manifest_b = canonical_manifest_digest(SAMPLE_MANIFEST_B).unwrap();
    let tree = build_merkle_tree(&[manifest_a.clone(), manifest_b.clone()]).unwrap();
    assert_eq!(
        tree.root_hex().unwrap(),
        "b8d99276c684e50aac375f8f8515341e46c6825eefd5864dee9319f238911e0c"
    );
    assert_eq!(tree.summary().unwrap().parameters.hash_alg, "SHA-256");
    assert_eq!(CANON_VERSION, "c2c-1");
}

#[test]
fn merkle_proof_round_trip_verification() {
    let manifest_a = canonical_manifest_digest(SAMPLE_MANIFEST_A).unwrap();
    let manifest_b = canonical_manifest_digest(SAMPLE_MANIFEST_B).unwrap();

    let mut builder = MerkleTreeBuilder::new();
    builder.push_digest(&manifest_a).unwrap();
    builder.push_digest(&manifest_b).unwrap();
    let tree = builder.build().unwrap();

    let proof = tree.proof_by_digest(manifest_a.as_hex()).unwrap();
    let mut computed = proof.leaf_hash;
    let mut index = proof.leaf_index();
    for sibling in proof.audit_path().as_bytes() {
        let mut hasher = Sha256::new();
        if index % 2 == 1 {
            hasher.update(sibling);
            hasher.update(&computed);
        } else {
            hasher.update(&computed);
            hasher.update(sibling);
        }
        computed = hasher.finalize().into();
        index /= 2;
    }

    assert_eq!(hex::encode(computed), proof.root_hex());
    assert_eq!(hex::encode(proof.leaf_hash), proof.leaf_hash_hex());
}

#[test]
fn merkle_tree_with_single_leaf_duplicates_last() {
    let manifest_a = canonical_manifest_digest(SAMPLE_MANIFEST_A).unwrap();
    let tree = build_merkle_tree(&[manifest_a]).unwrap();
    assert!(tree.duplicated_last_leaf());
    let proof = tree.proof_by_index(0).unwrap();
    assert_eq!(proof.audit_path().len(), 1);
    assert_eq!(
        proof.audit_path_hex()[0],
        "bf0110057dbfd67acbaccc5a50139396c22d16bcaaa21e70bd04626175c3835c"
    );
}
