# Database Migrations - Phase 46

Reversible database migrations with Liquibase rollback support and compatibility-first strategy.

## Strategy

**Primary**: Liquibase with explicit rollback definitions  
**Fallback**: Compatibility-first (compat-first) for non-reversible changes

## Liquibase Commands

### Apply migrations
```bash
liquibase update
```

### Rollback by tag
```bash
liquibase rollback phase46-complete
```

### Rollback by count (last N changesets)
```bash
liquibase rollback-count 3
```

### Rollback by date
```bash
liquibase rollback-to-date 2024-01-15
```

### Test rollback in staging
```bash
# 1. Take snapshot
liquibase snapshot --snapshot-format=json > pre-migration-snapshot.json

# 2. Apply migration
liquibase update

# 3. Validate
# Run tests, check schema

# 4. Test rollback
liquibase rollback phase46-complete

# 5. Validate rollback
# Compare with snapshot
liquibase diff --reference-url=offline:postgresql?snapshot=pre-migration-snapshot.json
```

## Compatibility-First Pattern

For migrations that cannot be easily rolled back (e.g., data transformations):

### Phase 1: Make schema backward-compatible
```sql
-- Add new column as nullable
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT NULL;

-- App can now handle both NULL and boolean values
-- Deploy app code that supports both schemas
```

### Phase 2: Migrate data
```sql
-- Backfill data
UPDATE users SET email_verified = false WHERE email_verified IS NULL;
```

### Phase 3: Make required (optional)
```sql
-- After app rollback window passes
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false;
```

### Rollback Strategy
App rollback is safe because column is nullable. Database doesn't need rollback.

## Migration Workflow

### Development
```bash
# Create new changeset
vim changelog.xml

# Test locally
liquibase update

# Test rollback
liquibase rollback-count 1

# Verify
psql -c "SELECT * FROM databasechangelog ORDER BY dateexecuted DESC LIMIT 5;"
```

### Staging Deployment
```bash
# Pre-deploy snapshot
liquibase snapshot > staging-pre-deploy.json

# Deploy
liquibase update

# Validate
./scripts/validate-schema.sh

# Test rollback drill
liquibase rollback-count 1
liquibase update  # Re-apply for real deployment
```

### Production Deployment
```bash
# Production requires approval (see CD workflow)

# 1. Deploy app code first (supports both schemas)
# 2. Run migration
liquibase update --tag=prod-$(date +%Y%m%d-%H%M%S)

# 3. Monitor for 24 hours
# 4. If stable, remove old code paths
```

## Rollback Procedures

### Scenario 1: Migration just deployed (< 1 hour)
```bash
# Immediate rollback
liquibase rollback-count 1

# Verify
./scripts/validate-schema.sh
```

### Scenario 2: App regression after migration
```bash
# 1. Rollback app code (supports old schema)
wrangler rollback

# 2. Schema rollback (if needed)
liquibase rollback-to-date $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S)
```

### Scenario 3: Non-reversible migration (compat-first)
```bash
# No DB rollback needed - app rollback handles it
wrangler rollback

# Schema remains in compatible state
```

## Best Practices

1. **Always write rollback** - Even if you think you won't need it
2. **Test rollback in staging** - Before production deployment
3. **Snapshot before migrate** - Enable diff comparison
4. **Prefer additive changes** - Add columns, don't modify/drop
5. **Use nullable first** - Make required in separate changeset
6. **Tag after major changes** - Enable rollback to known-good states
7. **Monitor after migration** - 24-48 hour observation window

## Common Patterns

### Safe: Add nullable column
```xml
<changeSet id="add-column-safe" author="dev">
  <addColumn tableName="table">
    <column name="new_field" type="varchar(255)">
      <constraints nullable="true"/>
    </column>
  </addColumn>
  <rollback>
    <dropColumn tableName="table" columnName="new_field"/>
  </rollback>
</changeSet>
```

### Safe: Add index
```xml
<changeSet id="add-index-safe" author="dev">
  <createIndex tableName="table" indexName="idx_field">
    <column name="field"/>
  </createIndex>
  <rollback>
    <dropIndex tableName="table" indexName="idx_field"/>
  </rollback>
</changeSet>
```

### Risky: Drop column (use compat-first)
```xml
<!-- Phase 1: Remove from app code -->
<!-- Phase 2: Drop column (only after rollback window) -->
<changeSet id="drop-column-risky" author="dev">
  <dropColumn tableName="table" columnName="old_field"/>
  <!-- No rollback - compat-first strategy -->
</changeSet>
```

### Risky: Rename column (use compat-first)
```xml
<!-- Phase 1: Add new column -->
<changeSet id="rename-1-add" author="dev">
  <addColumn tableName="table">
    <column name="new_name" type="varchar(255)"/>
  </addColumn>
</changeSet>

<!-- Phase 2: Copy data -->
<changeSet id="rename-2-copy" author="dev">
  <sql>UPDATE table SET new_name = old_name WHERE new_name IS NULL</sql>
</changeSet>

<!-- Phase 3: Update app to use new_name -->
<!-- Phase 4: Drop old column (after rollback window) -->
<changeSet id="rename-3-drop" author="dev">
  <dropColumn tableName="table" columnName="old_name"/>
</changeSet>
```

## References

- [Liquibase Rollback Documentation](https://docs.liquibase.com/commands/rollback/rollback-by-tag.html)
- [Flyway Undo Migrations](https://documentation.red-gate.com/flyway/flyway-cli-and-api/usage/undo-migrations)
- [SRE Workbook: Schema Migrations](https://sre.google)
- Phase 46: CI/CD Enterprise-Grade specification
