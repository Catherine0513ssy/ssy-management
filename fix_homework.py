
import sqlite3
src = sqlite3.connect("/var/www/homework/backups/ssy_2026-05-09T16-00-00.db")
dst = sqlite3.connect("/var/www/homework/ssy.db")
src_cur = src.cursor()
dst_cur = dst.cursor()

src_cur.execute("SELECT * FROM homework_items")
rows = src_cur.fetchall()
print(f"homework_items: {len(rows)} rows to migrate")

for row in rows:
    dst_cur.execute("INSERT INTO homework_items VALUES (?,?,?,?,?,?,?,?)", row)

dst.commit()
print("Done")
