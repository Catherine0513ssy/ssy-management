import sqlite3

src = "/var/www/homework/ssy.db.bak.20260507_multiimg"
dst = "/var/www/homework/ssy.db"

src_conn = sqlite3.connect(src)
src_cur = src_conn.cursor()

dst_conn = sqlite3.connect(dst)
dst_cur = dst_conn.cursor()

# Get all tables
tables = []
for row in src_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    tables.append(row[0])

print("Tables:", tables)

# Special column mappings for tables with schema differences
COLUMN_MAPPINGS = {
    'checkin_records': 'id, session_id, student_id, student_index, group_index, passed, created_at'
}

for table in tables:
    dst_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not dst_cur.fetchone():
        print(f"Skipping {table} - not in destination")
        continue

    if table == "sqlite_sequence":
        continue

    try:
        dst_cur.execute(f"DELETE FROM {table}")
    except:
        pass

    try:
        # Use explicit columns if mapping exists
        cols = COLUMN_MAPPINGS.get(table, '*')
        src_cur.execute(f"SELECT {cols} FROM {table}")
        rows = src_cur.fetchall()
        if not rows:
            print(f"{table}: 0 rows")
            continue

        col_count = len(rows[0])
        placeholders = ",".join(["?"] * col_count)
        dst_cur.executemany(f"INSERT INTO {table} VALUES ({placeholders})", rows)
        print(f"{table}: {len(rows)} rows migrated")
    except Exception as e:
        print(f"{table}: ERROR - {e}")

dst_conn.commit()
src_conn.close()
dst_conn.close()
print("Done")
