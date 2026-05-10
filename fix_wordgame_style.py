"""Fix wordgame tab style to match header design."""
import re

with open('/var/www/homework/public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

original = content
changes = 0

# 1. Fix .wordgame-wrap
old = '''    .wordgame-wrap {
      margin: -30px;
      padding: 20px;
      min-height: calc(100vh - 64px);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
      display: flex;
      flex-direction: column;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      overflow: hidden;
    }
    @media (max-width: 768px) {
      .wordgame-wrap { margin: -20px; padding: 14px; min-height: calc(100vh - 64px); }
    }'''
new = '''    .wordgame-wrap {
      padding: 0;
      min-height: calc(100vh - 64px);
      background: linear-gradient(180deg, #f8f5ff 0%, #fdf2f8 40%, #f0f4ff 100%);
      display: flex;
      flex-direction: column;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      overflow: hidden;
    }
    @media (max-width: 768px) {
      .wordgame-wrap { padding: 0; min-height: calc(100vh - 64px); }
    }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[1] Fixed .wordgame-wrap")
else:
    print("[1] WARN: .wordgame-wrap not found")

# 2. Fix .wordgame-bg (fixed -> absolute)
old = '''    .wordgame-bg {
      position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
    }'''
new = '''    .wordgame-bg {
      position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
    }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[2] Fixed .wordgame-bg")
else:
    print("[2] WARN: .wordgame-bg not found")

# 3. Fix .wordgame-particle
old = '''    .wordgame-particle {
      position: absolute; border-radius: 50%; background: rgba(255,255,255,0.55);
      animation: wgFloatUp linear infinite;
      box-shadow: 0 0 10px rgba(255,255,255,0.6);
    }'''
new = '''    .wordgame-particle {
      position: absolute; border-radius: 50%; background: rgba(167,139,250,0.22);
      animation: wgFloatUp linear infinite;
      box-shadow: 0 0 10px rgba(167,139,250,0.25);
    }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[3] Fixed .wordgame-particle")
else:
    print("[3] WARN: .wordgame-particle not found")

# 4. Fix .wordgame-star
old = '''    .wordgame-star {
      position: absolute; width: 5px; height: 5px; background: white; border-radius: 50%;
      animation: wgTwinkle ease-in-out infinite;
      box-shadow: 0 0 10px 3px rgba(255,255,255,0.9), 0 0 20px 6px rgba(255,255,200,0.5);
    }'''
new = '''    .wordgame-star {
      position: absolute; width: 5px; height: 5px; background: #c4b5fd; border-radius: 50%;
      animation: wgTwinkle ease-in-out infinite;
      box-shadow: 0 0 10px 3px rgba(167,139,250,0.35), 0 0 20px 6px rgba(167,139,250,0.15);
    }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[4] Fixed .wordgame-star")
else:
    print("[4] WARN: .wordgame-star not found")

# 5. Fix .wg-title
old = '''    .wg-title { font-size: clamp(2.4em, 6vw, 4em); color: white; text-shadow: 0 6px 30px rgba(0,0,0,0.35); text-align: center; letter-spacing: -0.5px; }'''
new = '''    .wg-title { font-size: clamp(1.8em, 4vw, 2.6em); color: #1f2937; text-align: center; letter-spacing: -0.5px; font-weight: 800; margin: 0; }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[5] Fixed .wg-title")
else:
    print("[5] WARN: .wg-title not found")

# 6. Fix .wg-subtitle
old = '''    .wg-subtitle { color: rgba(255,255,255,0.9); font-size: 1.25em; margin-bottom: 2px; text-align: center; text-shadow: 0 2px 8px rgba(0,0,0,0.2); }'''
new = '''    .wg-subtitle { color: #64748b; font-size: 1em; margin: 4px 0 0; text-align: center; }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[6] Fixed .wg-subtitle")
else:
    print("[6] WARN: .wg-subtitle not found")

# 7. Fix .wg-player-side h4
old = '''    .wg-player-side h4 { text-align: center; color: white; background: rgba(0,0,0,0.25); padding: 8px; border-radius: 12px; font-size: 1.05em; flex-shrink: 0; font-weight: 700; letter-spacing: 0.5px; }'''
new = '''    .wg-player-side h4 { text-align: center; color: #1f2937; background: rgba(255,255,255,0.85); padding: 8px; border-radius: 12px; font-size: 1.05em; flex-shrink: 0; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[7] Fixed .wg-player-side h4")
else:
    print("[7] WARN: .wg-player-side h4 not found")

# 8. Fix .wg-vs-divider
old = '''    .wg-vs-divider { display: flex; align-items: center; font-size: 1.3em; color: white; font-weight: 900; text-shadow: 0 3px 12px rgba(0,0,0,0.35); padding: 0 6px; }'''
new = '''    .wg-vs-divider { display: flex; align-items: center; font-size: 1.3em; color: #7c3aed; font-weight: 900; padding: 0 6px; }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[8] Fixed .wg-vs-divider")
else:
    print("[8] WARN: .wg-vs-divider not found")

# 9. Fix mobile .wg-title
old = '''      .wg-title { font-size: clamp(2em, 5vw, 3.2em); }'''
new = '''      .wg-title { font-size: clamp(1.6em, 4vw, 2.4em); }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[9] Fixed mobile .wg-title")
else:
    print("[9] WARN: mobile .wg-title not found")

# 10. Fix .wg-home to add centered container
old = '''    .wg-home { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 22px; z-index: 1; }'''
new = '''    .wg-home { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 22px; z-index: 1; padding: 24px; max-width: 900px; margin: 0 auto; width: 100%; box-sizing: border-box; }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[10] Fixed .wg-home")
else:
    print("[10] WARN: .wg-home not found")

# 11. Add new .wg-header-card style after .wg-home
old = '''    .wg-home { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 22px; z-index: 1; padding: 24px; max-width: 900px; margin: 0 auto; width: 100%; box-sizing: border-box; }'''
new = '''    .wg-home { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 22px; z-index: 1; padding: 24px; max-width: 900px; margin: 0 auto; width: 100%; box-sizing: border-box; }
    .wg-header-card {
      background: rgba(255,255,255,0.92); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(0,0,0,0.08); box-shadow: 0 1px 8px rgba(0,0,0,0.04);
      padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; z-index: 2; width: 100%; box-sizing: border-box;
    }
    .wg-header-left { display: flex; flex-direction: column; gap: 2px; }
    .wg-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .wg-student-select { padding: 8px 14px; border-radius: 20px; border: 2px solid #e5e7eb; font-size: 0.9em; background: white; cursor: pointer; appearance: none; -webkit-appearance: none; font-weight: 600; color: #1f2937; min-width: 110px; }
    .wg-student-label { font-size: 0.8em; color: #6b7280; }
    .wg-student-name { font-weight: 700; color: #7c3aed; }'''
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("[11] Added .wg-header-card styles")
else:
    print("[11] WARN: could not add header card styles")

# 12. HTML: Replace title + student selection with header card
old_html = '''          <!-- Home Page -->
          <div class="wg-home" x-show="page==='home'">
            <h1 class="wg-title">🍬 英语单词消消乐</h1>
            <p class="wg-subtitle">翻译配对，记单词</p>

            <!-- 学生选择 -->
            <div style="background:rgba(255,255,255,0.94);border-radius:16px;padding:16px 20px;width:100%;max-width:420px;box-shadow:0 4px 16px rgba(0,0,0,0.08);box-sizing:border-box;">
              <h3 style="margin:0 0 12px;font-size:1em;color:#1f2937;text-align:center;">👤 选择学生</h3>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <select x-model="studentClass" @change="studentName=''" style="padding:10px 14px;border-radius:24px;border:2px solid #e5e7eb;font-size:0.95em;background:white;cursor:pointer;appearance:none;-webkit-appearance:none;text-align:center;font-weight:600;color:#1f2937;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%2364748b%22 viewBox=%220 0 16 16%22%3E%3Cpath d=%22M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z%22/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;">
                  <option value="">选择班级</option>
                  <option value="2313">2313班</option>
                  <option value="2314">2314班</option>
                </select>
                <select x-model="studentName" :disabled="!studentClass" style="padding:10px 14px;border-radius:24px;border:2px solid #e5e7eb;font-size:0.95em;background:white;cursor:pointer;appearance:none;-webkit-appearance:none;text-align:center;font-weight:600;color:#1f2937;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%2364748b%22 viewBox=%220 0 16 16%22%3E%3Cpath d=%22M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z%22/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;">
                  <option value="">选择姓名</option>
                  <template x-for="name in (studentList[studentClass]||[])" :key="name">
                    <option :value="name" x-text="name"></option>
                  </template>
                </select>
              </div>
              <div x-show="studentName" style="text-align:center;font-size:0.85em;color:#6b7280;">
                当前玩家：<span x-text="studentName" style="font-weight:700;color:#7c3aed;"></span>
              </div>
            </div>'''

new_html = '''          <!-- Home Page -->
          <div class="wg-home" x-show="page==='home'">
            <!-- Header Card matching app-header style -->
            <div class="wg-header-card">
              <div class="wg-header-left">
                <h1 class="wg-title">🍬 英语单词消消乐</h1>
                <p class="wg-subtitle">翻译配对，记单词</p>
              </div>
              <div class="wg-header-right">
                <select class="wg-student-select" x-model="studentClass" @change="studentName=''">
                  <option value="">选择班级</option>
                  <option value="2313">2313班</option>
                  <option value="2314">2314班</option>
                </select>
                <select class="wg-student-select" x-model="studentName" :disabled="!studentClass">
                  <option value="">选择姓名</option>
                  <template x-for="name in (studentList[studentClass]||[])" :key="name">
                    <option :value="name" x-text="name"></option>
                  </template>
                </select>
                <div x-show="studentName" class="wg-student-label">
                  玩家：<span class="wg-student-name" x-text="studentName"></span>
                </div>
              </div>
            </div>'''

if old_html in content:
    content = content.replace(old_html, new_html)
    changes += 1
    print("[12] Replaced HTML header + student selection")
else:
    print("[12] WARN: HTML header not found")

if changes > 0:
    with open('/var/www/homework/public/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\nTotal changes: {changes}")
    print("File saved.")
else:
    print("\nNo changes made!")
