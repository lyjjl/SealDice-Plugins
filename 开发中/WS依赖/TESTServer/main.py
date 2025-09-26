import asyncio
import json
import websockets

C = set()

async def r(ws):
    global C
    C.add(ws)
    print(f"新连接: {ws.remote_address}")
    await s()

async def u(ws):
    global C
    if ws in C:
        C.remove(ws)
    print(f"已断开: {ws.remote_address}")
    await s()

async def s():
    print(f"--- 客户端数量: {len(C)} ---")
    
async def i():
    while True:
        try:
            msg_t = await asyncio.to_thread(input, "输入JSON消息 ('exit' 退出): ")
            
            if msg_t.lower() == 'exit':
                print("正在退出...")
                for t in asyncio.all_tasks():
                    if t is not asyncio.current_task():
                        t.cancel()
                return

            try:
                msg_j = json.loads(msg_t)
                msg_s = json.dumps(msg_j)
            except json.JSONDecodeError:
                print("无效JSON。")
                continue

            if C:
                await asyncio.gather(*[c.send(msg_s) for c in C])
                print(f"已发送: {msg_s}")
            else:
                print("无客户端连接。")

        except asyncio.CancelledError:
            print("任务已取消。")
            break
        except Exception as e:
            print(f"错误: {e}")

async def h(ws):
    try:
        await r(ws)
        async for msg in ws:
            print(f"收到: {msg}")
    except websockets.exceptions.ConnectionClosed as e:
        print(f"连接关闭，代码: {e.code}, 原因: {e.reason}")
    finally:
        await u(ws)

async def m():
    async with websockets.serve(h, "localhost", 8765):
        print("服务器已启动在 ws://localhost:8765")
        print("等待连接...")
        
        task_i = asyncio.create_task(i())
        await task_i
        
        print("正在取消所有任务...")
        for t in asyncio.all_tasks():
            if t is not asyncio.current_task():
                t.cancel()
        print("所有任务已取消。")
        
if __name__ == "__main__":
    try:
        asyncio.run(m())
    except KeyboardInterrupt:
        print("强制中断。")
    print("服务器已关闭。")