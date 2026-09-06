-- Migration: 039_sort_order_double
-- Description: Change issues.sort_order from INT to DOUBLE PRECISION for fractional reorder (drag-and-drop)
-- ROLLBACK: ALTER TABLE issues ALTER COLUMN sort_order TYPE INT USING sort_order::int;

ALTER TABLE issues ALTER COLUMN sort_order TYPE DOUBLE PRECISION USING sort_order::double precision;
