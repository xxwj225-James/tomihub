-- Remove Jira and Confluence from skill tags (not relevant to TomiHub)
DELETE FROM master_data WHERE category = 'skill_tags' AND key IN ('jira_admin', 'confluence');
