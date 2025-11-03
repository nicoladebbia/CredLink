/**
 * RFC 3161/5816 TimeStampToken types and interfaces
 * Strict compliance with IETF specifications
 * Security-hardened with comprehensive validation and type safety
 */
export var PKIStatus;
(function (PKIStatus) {
    /** Request granted */
    PKIStatus[PKIStatus["GRANTED"] = 0] = "GRANTED";
    /** Request granted with modifications */
    PKIStatus[PKIStatus["GRANTED_WITH_MODS"] = 1] = "GRANTED_WITH_MODS";
    /** Request rejected */
    PKIStatus[PKIStatus["REJECTION"] = 2] = "REJECTION";
    /** Request waiting for confirmation */
    PKIStatus[PKIStatus["WAITING"] = 3] = "WAITING";
    /** Revocation warning */
    PKIStatus[PKIStatus["REVOCATION_WARNING"] = 4] = "REVOCATION_WARNING";
    /** Revocation notification */
    PKIStatus[PKIStatus["REVOCATION_NOTIFICATION"] = 5] = "REVOCATION_NOTIFICATION";
    /** Partial information available */
    PKIStatus[PKIStatus["PARTIAL_INFO"] = 6] = "PARTIAL_INFO";
})(PKIStatus || (PKIStatus = {}));
//# sourceMappingURL=rfc3161.js.map