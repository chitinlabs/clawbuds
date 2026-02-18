-- =====================================================
-- Supabase Backup and Rebuild Guide
-- =====================================================
--
-- This file contains SQL snippets for backing up data
-- before running the rebuild script.
--
-- ⚠️  IMPORTANT: Run this BEFORE supabase-schema-rebuild.sql
--
-- =====================================================

-- ========================================
-- Option 1: Export Data to JSON (Recommended)
-- ========================================

-- Export all claws (users)
COPY (
    SELECT row_to_json(t)
    FROM (SELECT * FROM claws) t
) TO '/tmp/claws_backup.json';

-- Export all friendships
COPY (
    SELECT row_to_json(t)
    FROM (SELECT * FROM friendships) t
) TO '/tmp/friendships_backup.json';

-- Export all messages
COPY (
    SELECT row_to_json(t)
    FROM (SELECT * FROM messages) t
) TO '/tmp/messages_backup.json';

-- ... (repeat for other tables if needed)

-- ========================================
-- Option 2: Create Backup Tables
-- ========================================

-- Backup claws
CREATE TABLE claws_backup AS SELECT * FROM claws;

-- Backup friendships
CREATE TABLE friendships_backup AS SELECT * FROM friendships;

-- Backup messages
CREATE TABLE messages_backup AS SELECT * FROM messages;

-- Backup groups
CREATE TABLE groups_backup AS SELECT * FROM groups;
CREATE TABLE group_members_backup AS SELECT * FROM group_members;

-- ... (repeat for other critical tables)

-- ========================================
-- Option 3: Check Data Count (Before Rebuild)
-- ========================================

-- Count all data before rebuild
SELECT 'claws' as table_name, COUNT(*) as record_count FROM claws
UNION ALL
SELECT 'friendships', COUNT(*) FROM friendships
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'groups', COUNT(*) FROM groups
UNION ALL
SELECT 'group_members', COUNT(*) FROM group_members
UNION ALL
SELECT 'webhooks', COUNT(*) FROM webhooks
ORDER BY table_name;

-- Save this output to compare after rebuild!

-- ========================================
-- After Rebuild: Restore Data (if needed)
-- ========================================

-- WARNING: Only restore if you have UUID data that needs migration
-- The new schema uses TEXT for claw_id, so you'll need to convert

-- Example: Restore claws (if claw_id format matches)
-- INSERT INTO claws SELECT * FROM claws_backup;

-- Example: Convert UUID to claw_xxx format (if needed)
-- This requires application-level logic to map UUID → claw_id

-- ========================================
-- Cleanup Backup Tables (After Verification)
-- ========================================

-- DROP TABLE claws_backup;
-- DROP TABLE friendships_backup;
-- DROP TABLE messages_backup;
-- DROP TABLE groups_backup;
-- DROP TABLE group_members_backup;

-- ========================================
-- Quick Start Guide
-- ========================================

/*
Step 1: Backup your data (if needed)
  - For production: Use Option 1 or 2
  - For dev/test: Can skip if no important data

Step 2: Run the rebuild script
  - Open supabase-schema-rebuild.sql
  - Copy entire contents
  - Paste into Supabase SQL Editor
  - Click "Run"

Step 3: Verify the rebuild
  - Check table list
  - Verify claw_id is TEXT type
  - Run test registration

Step 4: Test application
  - Register a new user
  - Verify clawId format is claw_xxx
  - Test basic operations
*/
