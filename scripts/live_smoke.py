"""Smoke-test the Gemini Live API with the configuration the voice tutor will use.

Usage (the key is read from the environment and never printed):

    GEMINI_API_KEY=... uv run python scripts/live_smoke.py question.wav

``question.wav`` must be 16 kHz, mono, 16-bit PCM. On macOS:

    say -o q.aiff "What is Newton's second law?"
    afconvert -f WAVE -d LEI16@16000 -c 1 q.aiff question.wav
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import wave

from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-3.8-live"
CHUNK_FRAMES = 640  # 40 ms at 16 kHz

BOARD_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="show_on_board",
            description="Show equations and worked steps on the learner's board.",
            behavior=types.Behavior.NON_BLOCKING,
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(type=types.Type.STRING),
                    "markdown": types.Schema(type=types.Type.STRING),
                },
                required=["markdown"],
            ),
        )
    ]
)


def live_config() -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=(
            "You are a Physics tutor speaking with an adult. Answer in at most "
            "three short spoken sentences. Put every equation on the board with "
            "show_on_board; never read LaTeX aloud."
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        session_resumption=types.SessionResumptionConfig(),
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow()
        ),
        tools=[BOARD_TOOL],
    )


def read_pcm(path: str) -> bytes:
    with wave.open(path, "rb") as wav:
        params = (wav.getframerate(), wav.getnchannels(), wav.getsampwidth())
        if params != (16000, 1, 2):
            sys.exit(f"{path} must be 16 kHz mono 16-bit, got {params}")
        return wav.readframes(wav.getnframes())


def list_models(client: genai.Client) -> None:
    live, text = [], []
    for model in client.models.list():
        name = (model.name or "").removeprefix("models/")
        actions = model.supported_actions or []
        if "bidiGenerateContent" in actions:
            live.append(name)
        elif "generateContent" in actions and "flash" in name:
            text.append(name)
    print("live models:", ", ".join(sorted(live)) or "none")
    print("text flash models:", ", ".join(sorted(text)) or "none")


async def run(client: genai.Client, model: str, pcm: bytes) -> int:
    seen = {"audio_bytes": 0, "heard": "", "said": "", "board": [], "resumable": False}
    started = time.monotonic()
    first_audio = None
    async with client.aio.live.connect(model=model, config=live_config()) as session:
        print(f"connected to {model}")

        async def send() -> None:
            nonlocal started
            silence = b"\x00\x00" * 16000 * 2  # 2 s so server VAD ends the turn
            step = CHUNK_FRAMES * 2
            payload = pcm + silence
            for i in range(0, len(payload), step):
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=payload[i : i + step], mime_type="audio/pcm;rate=16000"
                    )
                )
                if i < len(pcm) <= i + step:
                    started = time.monotonic()  # speech finished
                await asyncio.sleep(CHUNK_FRAMES / 16000)

        async def receive() -> None:
            nonlocal first_audio
            async for msg in session.receive():
                if msg.session_resumption_update:
                    seen["resumable"] |= bool(msg.session_resumption_update.resumable)
                if msg.tool_call:
                    for call in msg.tool_call.function_calls or []:
                        seen["board"].append(str((call.args or {}).get("markdown", "")))
                        await session.send_tool_response(
                            function_responses=types.FunctionResponse(
                                id=call.id,
                                name=call.name,
                                response={"result": "shown"},
                                scheduling=types.FunctionResponseScheduling.SILENT,
                            )
                        )
                content = msg.server_content
                if not content:
                    continue
                if content.input_transcription:
                    seen["heard"] += content.input_transcription.text or ""
                if content.output_transcription:
                    seen["said"] += content.output_transcription.text or ""
                for part in (content.model_turn and content.model_turn.parts) or []:
                    if part.inline_data and part.inline_data.data:
                        first_audio = first_audio or time.monotonic()
                        seen["audio_bytes"] += len(part.inline_data.data)

        sender = asyncio.create_task(send())
        try:
            await asyncio.wait_for(receive(), timeout=45)
        except TimeoutError:
            print("timed out waiting for turn_complete")
        finally:
            sender.cancel()

    print("heard :", seen["heard"].strip() or "(nothing)")
    print("said  :", seen["said"].strip()[:300] or "(nothing)")
    print(f"audio : {seen['audio_bytes'] / 48000:.1f} s of speech")
    if first_audio:
        print(f"delay : {first_audio - started:.2f} s from end of speech to reply")
    print("board :", len(seen["board"]), "call(s)", (seen["board"] or [""])[0][:200])
    print("resumable session handle:", seen["resumable"])
    return 0 if seen["audio_bytes"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("wav", help="16 kHz mono 16-bit question audio")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit("Set GEMINI_API_KEY in the environment.")
    client = genai.Client(api_key=key)
    pcm = read_pcm(args.wav)
    list_models(client)
    try:
        return asyncio.run(run(client, args.model, pcm))
    except Exception as exc:  # report without echoing the key
        print("FAILED:", type(exc).__name__, str(exc).replace(key, "<key>")[:400])
        return 1


if __name__ == "__main__":
    sys.exit(main())
