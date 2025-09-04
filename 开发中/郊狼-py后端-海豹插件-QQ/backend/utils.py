# utils.py

import qrcode
import io
import json
import os
from qrcode import constants

import asyncio
import time
from typing import List, Tuple
from pydglab_ws.client.base import DGLabClient, Channel, FeedbackButton, RetCode
from main import client

def print_qrcode(data: str):
    """输出二维码到终端界面"""
    qr = qrcode.QRCode()
    qr.add_data(data)
    f = io.StringIO()
    qr.print_ascii(out=f)
    f.seek(0)
    print(f.read())

def save_qrcode(data: str, filename: str = "qr-code.png"):

    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        
        qr.add_data(data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        
        with open(filename, 'wb') as f:
            img.save(f)
            
        print(f"二维码已成功保存为 {filename}")
        return True

    except Exception as e:
        print(f"保存二维码时发生错误：{e}")
        return False

def load_default_wave_list(file_path='./config/default_wave_list.json'):

    if not os.path.exists(file_path):
        print(f"错误: 波形文件 '{file_path}' 不存在。")
        return {}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data
    except json.JSONDecodeError:
        print(f"错误: 波形文件 '{file_path}' 格式不正确。请检查 JSON 语法。")
        return {}
    except Exception as e:
        print(f"加载配置文件时发生未知错误: {e}")
        return {}
    



def _transform_waves(wave_array: List[Tuple[int, ...]]):
    """
    将仅包含强度值的波形数组转换为add_pulses API所需的完整PulseOperation格式。
    
    Args:
        wave_array (List[Tuple[int, ...]]): 包含1-N个波形模式的数组。
        
    Returns:
        List[Tuple]: 转换后的脉冲操作列表。
    """

    freq_op = (2, 50)  

    strength_type = 1

    operations = []

    for pattern in wave_array:

        for strength_value in pattern:
            strength_op = (strength_type, strength_value)

            pulse_op = (freq_op, strength_op)
            operations.append(pulse_op)
    return operations

async def send_wave_loop(
    client: DGLabClient,
    wave_array: List[Tuple[int, ...]],
    channel: Channel,
    duration_ms: int
):
    """
    在指定时间内，循环向指定通道发送波形数据。
    
    Args:
        client (DGLabClient): DGLab 客户端实例。
        wave_array (List[Tuple[int, ...]]): 包含1-N个波形的数组。每个波形是一个元组或列表。
        channel (Channel): 发送波形的通道，可以是 Channel.A 或 Channel.B。
        duration_ms (int): 总的发送时长，单位为毫秒。
    """
    if not wave_array:
        print("错误：波形数组为空，无法发送。")
        return
    
    pulses_to_send = _transform_waves(wave_array)

    total_wave_duration_s = len(pulses_to_send) * 0.1
    
    if total_wave_duration_s <= 0:
        print("错误：波形数据无效，总时长为零或负数。")
        return
        
    send_interval_s = max(total_wave_duration_s - 0.05, 0.01)

    print(f"开始向通道 {channel.name} 循环发送波形，总时长 {duration_ms} 毫秒。")
    print(f"每轮波形总时长：{total_wave_duration_s:.2f} 秒。发送间隔：{send_interval_s:.2f} 秒。")

    start_time = time.monotonic()

    try:
        while (time.monotonic() - start_time) * 1000 < duration_ms:
            await client.add_pulses(channel, *pulses_to_send)

            await asyncio.sleep(send_interval_s)

    except Exception as e:
        print(f"波形发送过程中发生错误: {e}")
        
    finally:
        elapsed_time_s = time.monotonic() - start_time
        print(f"计时结束。总共用时 {elapsed_time_s:.2f} 秒。正在清空通道 {channel.name} 的波形。")
        await client.clear_pulses(channel)

async def simple_send_wave(target_channel, wave_data):
        if not wave_data:
            print("错误：波形数据为空，无法发送。")
            return
        if target_channel.lower() == "a":
            target_channel = Channel.A
        elif target_channel.lower() == "b":
            target_channel = Channel.B
        else:
            print("未知的通道")
            return

        wave_data_iterator = iter(wave_data.values())
        wave_data_current = next(wave_data_iterator, None)
        if not wave_data_current:
            return
        await client.add_pulses(target_channel, *(wave_data_current * 5)) 

