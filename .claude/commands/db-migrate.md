# Database Migration

Guide schema changes safely for the MariaDB database on the Synology NAS.

## Process

1. Describe the schema change needed (add column, modify type, add table, add index)
2. Generate the migration SQL with appropriate safety:
   - Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` when supported
   - Use `CREATE TABLE IF NOT EXISTS` for new tables
   - Include `DEFAULT` values for new non-null columns on existing tables
   - Add appropriate indexes for new columns used in WHERE clauses
3. Update `db/schema.sql` to reflect the final desired schema state
4. Update any affected queries in route files or middleware
5. Test the migration against a copy of the database before production

## Safety Rules

- NEVER use `DROP TABLE` or `DROP COLUMN` without explicit confirmation
- ALWAYS back up the database before applying migrations:
  ```bash
  mysqldump -u root -p --port 3307 quartier_bikes > backup_before_migration.sql
  ```
- Add columns as `NULL` or with `DEFAULT` to avoid breaking existing rows
- Test INSERT, UPDATE, SELECT queries that touch changed tables

## Output

Provide:
1. The migration SQL to run
2. The updated `db/schema.sql` section
3. Any application code changes needed
4. Rollback SQL (to undo the migration if needed)
