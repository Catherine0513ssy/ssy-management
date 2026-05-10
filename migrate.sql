-- 添加 period_id 字段
ALTER TABLE score_events ADD COLUMN period_id INTEGER DEFAULT 1;

-- 按时间更新周期归属
UPDATE score_events 
SET period_id = CASE 
  WHEN date >= '2026-03-23' AND date <= '2026-04-03' THEN 1
  WHEN date >= '2026-04-06' AND date <= '2026-04-17' THEN 2
  ELSE 1
END;

-- 验证结果
SELECT period_id, COUNT(*) as records, SUM(points) as points 
FROM score_events GROUP BY period_id;
