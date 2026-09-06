-- 067: issues.phase stores the dictionary KEY (master_data.project_phase.key),
-- not the display text — renaming a phase in Settings no longer orphans issues.
-- Legacy text values are matched back to their key; unmatchable rows go NULL.

-- 1. Match display text (case-insensitive) to the global phase dictionary
UPDATE issues i
SET phase = md.key
FROM master_data md
WHERE md.category = 'project_phase'
  AND lower(i.phase) = lower(md.value);

-- 2. Anything still not a dictionary key → NULL (old free-text / typo data)
UPDATE issues i
SET phase = NULL
WHERE i.phase IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM master_data md
    WHERE md.category = 'project_phase' AND md.key = i.phase
  );
