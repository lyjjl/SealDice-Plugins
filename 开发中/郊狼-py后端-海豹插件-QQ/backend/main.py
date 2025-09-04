import sys
import os
import asyncio

from fastapi import FastAPI
import uvicorn
from dotenv import load_dotenv

from pydglab_ws import StrengthData, RetCode, DGLabWSServer

from api import routes
from utils import print_qrcode, save_qrcode
from utils import load_default_wave_list

# 将 client 和 DEFAULT_WAVE_LIST 声明为全局变量
client = None
DEFAULT_WAVE_LIST = {}

# 加载环境变量
load_dotenv()
DG_LAB_WS_LOCAL_SERVER_HOST = os.getenv("DG_LAB_WS_LOCAL_SERVER_HOST", "0.0.0.0")
DG_LAB_WS_LOCAL_SERVER_DEFAULT_PORT = int(os.getenv("DG_LAB_WS_LOCAL_SERVER_DEFAULT_PORT", 15678))
HTTP_API_HOST = os.getenv("HTTP_API_HOST", "0.0.0.0")
HTTP_API_PORT = int(os.getenv("HTTP_API_PORT", 15679))
DEBUG_MODE = os.getenv("DEBUG", "False").lower() == 'true'

# 创建 FastAPI 实例
app = FastAPI()
app.include_router(routes.router)

async def initialize_app():
    global client, DEFAULT_WAVE_LIST

    if '--debug' in sys.argv:
        DEBUG_MODE = True
        print("程序以调试模式启动。")
    else:
        print("程序以普通模式启动。")

    server = DGLabWSServer(DG_LAB_WS_LOCAL_SERVER_HOST, DG_LAB_WS_LOCAL_SERVER_DEFAULT_PORT, 60)
    
    client = server.new_local_client()

    qrcode_data = client.get_qrcode(f"ws://127.0.0.1:{DG_LAB_WS_LOCAL_SERVER_DEFAULT_PORT}")
    print("请用 DG-Lab App 扫描二维码连接服务端")
    if qrcode_data:
        save_qrcode(qrcode_data)
        print("如控制台二维码无法扫描，请打开图片扫码")
        print_qrcode(qrcode_data)
    else:
        print("获取 qrcode 异常:type 1")
        return None

    DEFAULT_WAVE_LIST = load_default_wave_list()

    if '呼吸' in DEFAULT_WAVE_LIST:
        print("已成功加载默认波形数据")
    else:
        print("未能加载默认波形数据，请检查配置文件")

    # 等待绑定
    await client.bind()
    print(f"已与 App {client.target_id} 成功绑定。")

    # 从 App 接收数据更新，并进行远控操作
    async def process_data_from_app():
        if client:
            async for data in client.data_generator():
                # 接收通道强度数据
                if isinstance(data, StrengthData):
                    print(f"从 App 收到通道强度数据更新：{data}")
                # 接收 心跳 / App 断开通知
                elif data == RetCode.CLIENT_DISCONNECTED:
                    print("App 已断开连接，你可以尝试重新扫码进行连接绑定")
                    await client.rebind()
                    print("重新绑定成功")

    asyncio.create_task(process_data_from_app())

if __name__ == "__main__":
    try:
        # 在启动服务器前进行初始化
        asyncio.run(initialize_app())
        # 启动 FastAPI 应用
        uvicorn.run(app, host=HTTP_API_HOST, port=HTTP_API_PORT)
    except KeyboardInterrupt:
        print("接收到 Ctrl+C，程序正在退出...")