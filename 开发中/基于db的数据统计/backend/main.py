import os
import sqlite3
import signal
import sys
from flask import Flask, request, jsonify

app = Flask(__name__)

def get_db_stats_core(db_path):

    if not os.path.exists(db_path):
        return {"error": "file_not_found"}

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 取文件大小
        file_size_bytes = os.path.getsize(db_path)
        file_size_mb = file_size_bytes / (1024 * 1024)

        # 统计表和索引数量
        cursor.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%';")
        items = cursor.fetchall()
        
        tables = [item[0] for item in items if item[1] == 'table']
        indexes = [item[0] for item in items if item[1] == 'index']

        # 统计每张表的行数和总行数
        table_stats = {}
        total_rows = 0
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            row_count = cursor.fetchone()[0]
            table_stats[table] = row_count
            total_rows += row_count
        
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

def signal_handler(sig, frame):
    print('\n正在关闭服务...')
    sys.exit(0)

if __name__ == '__main__':
    # 注册 Ctrl+C 信号处理函数
    signal.signal(signal.SIGINT, signal_handler)
    print("服务已启动。使用 Ctrl+C 退出。")
    app.run(debug=False, host='0.0.0.0', port=5000)