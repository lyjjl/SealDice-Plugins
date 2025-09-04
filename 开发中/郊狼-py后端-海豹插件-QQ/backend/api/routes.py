from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils import simple_send_wave

# 导入 main.py 中的全局变量
import main 

router = APIRouter()

# 定义请求体模型
class SendWaveRequest(BaseModel):
    wave_name: str
    channel: str
    duration_ms: int

@router.get("/status")
def get_status():
    """获取服务状态的API"""
    return {"status": "ok", "message": "API is running!"}

@router.post("/send_wave")
async def send_wave(
    request: Request
):
    """
    接收波形数据请求并发送到DG-Lab设备。
    请求体示例：
    {
      "target_channel": "A",
      "wave_data": {
        "wave1": [20, 10, 20, 10]
      }
    }
    """
    try:
        # 获取请求体数据
        data = await request.json()
        target_channel = data.get("target_channel")
        wave_data = data.get("wave_data")

        if not target_channel or not wave_data:
            raise HTTPException(status_code=400, detail="请求体缺少'target_channel'或'wave_data'字段")

        # 取 client
        client = request.app.state.client
        if not client:
            raise HTTPException(status_code=503, detail="服务未连接到设备，请先完成设备绑定。")

        await simple_send_wave(target_channel, wave_data)

        return {"message": "波形发送成功！"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"发送波形失败：{str(e)}")