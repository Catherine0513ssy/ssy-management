import sqlite3
src = "/var/www/homework/backups/ssy_2026-05-09T16-00-00.db"
dst = "/var/www/homework/ssy.db"
src_conn = sqlite3.connect(src)
src_cur = src_conn.cursor()
dst_conn = sqlite3.connect(dst)
dst_cur = dst_conn.cursor()

tables = []
for row in src_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    tables.append(row[0])

COLUMN_MAPPINGS = {'checkin_records': 'id, session_id, student_id, student_index, group_index, passed, created_at'}

for table in tables:
    dst_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not dst_cur.fetchone():
        continue
    if table == "sqlite_sequence":
        continue
    try:
        dst_cur.execute(f"DELETE FROM {table}")
    except:
        pass
    try:
        cols = COLUMN_MAPPINGS.get(table, '*')
        src_cur.execute(f"SELECT {cols} FROM {table}")
        rows = src_cur.fetchall()
        if not rows:
            print(f"{table}: 0 rows")
            continue
        placeholders = ",".join(["?"] * len(rows[0]))
        dst_cur.executemany(f"INSERT INTO {table} VALUES ({placeholders})", rows)
        print(f"{table}: {len(rows)} rows")
    except Exception as e:
        print(f"{table}: ERROR - {e}")

dst_conn.commit()
src_conn.close()
dst_conn.close()
print("Done")
