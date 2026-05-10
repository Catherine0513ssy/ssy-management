
import sqlite3

def normalize_date(date_str):
    parts = date_str.split('-')
    if len(parts) != 3:
        return date_str
    return f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"

db = sqlite3.connect('/var/www/homework/ssy.db')
cursor = db.cursor()

tables = [
    'homework_items',
    'essay_tasks',
    'choice_fill_questions',
    'checkin_records',
    'excellent_homework',
    'quiz_papers',
    'daily_quiz',
    'spaced_repetition'
]

for table in tables:
    try:
        cursor.execute(f"SELECT DISTINCT date FROM {table} WHERE length(date) != 10 OR date NOT LIKE '____-__-__'")
        rows = cursor.fetchall()
        if not rows:
            print(f"{table}: OK")
            continue
        for (old_date,) in rows:
            new_date = normalize_date(old_date)
            if old_date != new_date:
                cursor.execute(f"UPDATE {table} SET date = ? WHERE date = ?", (new_date, old_date))
                print(f"{table}: {old_date} -> {new_date} ({cursor.rowcount} rows)")
    except Exception as e:
        print(f"{table}: ERROR {e}")

db.commit()
db.close()
print("Done")

