import os
import sqlite3
import signal
import sys
from flask import Flask, request, jsonify

app = Flask(__name__)

DB_PATH = './data/default/data.db'

def get_db_stats_core(db_path):
    if not os.path.exists(db_path):
        return {"error": "file_not_found"}

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        file_size_bytes = os.path.getsize(db_path)
        file_size_mb = file_size_bytes / (1024 * 1024)

        cursor.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%';")
        items = cursor.fetchall()
        
        tables = [item[0] for item in items if item[1] == 'table']
        indexes = [item[0] for item in items if item[1] == 'index']

        table_stats = {}
        total_rows = 0
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                row_count = cursor.fetchone()[0]
                table_stats[table] = row_count
                total_rows += row_count
            except sqlite3.OperationalError:
                continue
        
        conn.close()

        return {
            "file_path": db_path,
            "file_size_mb": round(file_size_mb, 2),
            "total_tables": len(tables),
            "total_indexes": len(indexes),
            "table_stats": table_stats,
            "total_rows": total_rows
        }

    except sqlite3.Error as e:
        if conn:
            conn.close()
        return {"error": "db_error", "message": str(e)}

@app.route('/get_db_stats', methods=['POST'])
def get_db_stats_api():
    data = request.get_json()
    if not data or 'path' not in data or 'filename' not in data:
        return jsonify({
            "status": "error",
            "message": "请求参数不完整，需要 'path' 和 'filename'。"
        }), 400

    db_path = os.path.join(data['path'], data['filename'])
    stats = get_db_stats_core(db_path)

    if "error" in stats:
        if stats["error"] == "file_not_found":
            return jsonify({
                "status": "error",
                "message": f"文件 '{db_path}' 不存在。请检查目录和文件名是否正确。"
            }), 404
        else: # db_error
            return jsonify({
                "status": "error",
                "message": f"数据库操作错误: {stats['message']}"
            }), 500
    
    return jsonify({
        "status": "success",
        "data": stats
    })

@app.route('/count', methods=['GET'])
def get_character_count():

    if not os.path.exists(DB_PATH):
        return jsonify({
            "status": "error",
            "message": f"文件 '{DB_PATH}' 不存在。"
        }), 404
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM attrs WHERE binding_sheet_id IS NOT NULL AND binding_sheet_id != ''")
        count = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            "character": count
        })
    except sqlite3.OperationalError:
        return jsonify({
            "status": "error",
            "message": "数据库中未找到 'attrs' 表或 'binding_sheet_id' 字段。"
        }), 500
    except sqlite3.Error as e:
        return jsonify({
            "status": "error",
            "message": f"数据库操作错误: {str(e)}"
        }), 500

def signal_handler(sig, frame):
    print('\n正在关闭服务...')
    sys.exit(0)

if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal_handler)
    print("服务已启动。使用 Ctrl+C 退出。")
    app.run(debug=False, host='0.0.0.0', port=5000)