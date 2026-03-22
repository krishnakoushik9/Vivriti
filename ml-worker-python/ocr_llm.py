import os
import torch
from PIL import Image
from pdf2image import convert_from_path
from transformers import AutoProcessor, AutoModelForImageTextToText
from qwen_vl_utils import process_vision_info

MODEL_PATH = "/home/krsna/Desktop/IITH-vivriti/ML-Model/Vision-LLM"

# Load model and processor globally (one-time)
print(f"[OCR-LLM] Loading model from {MODEL_PATH}...")
try:
    from transformers import Qwen2VLForConditionalGeneration
    model_class = Qwen2VLForConditionalGeneration
except ImportError:
    model_class = AutoModelForImageTextToText

model = model_class.from_pretrained(
    MODEL_PATH,
    device_map="cpu",
    local_files_only=True
)

processor = AutoProcessor.from_pretrained(
    MODEL_PATH,
    local_files_only=True
)

# Fix missing chat template if needed
if not hasattr(processor, 'chat_template') or processor.chat_template is None:
    processor.chat_template = (
        "{%- for message in messages -%}"
        "    {%- if loop.first and message['role'] == 'system' -%}"
        "        <|im_start|>system\n{{ message['content'] }}<|im_end|>\n"
        "    {%- else -%}"
        "        {%- if message['role'] == 'user' -%}"
        "            <|im_start|>user\n"
        "            {%- for content in message['content'] -%}"
        "                {%- if content['type'] == 'image' -%}"
        "                    <|vision_start|><|image_pad|><|vision_end|>"
        "                {%- elif content['type'] == 'text' -%}"
        "                    {{ content['text'] }}"
        "                {%- endif -%}"
        "            {%- endfor -%}"
        "            <|im_end|>\n"
        "        {%- elif message['role'] == 'assistant' -%}"
        "            <|im_start|>assistant\n{{ message['content'] }}<|im_end|>\n"
        "        {%- endif -%}"
        "    {%- endif -%}"
        "{%- endfor -%}"
        "{%- if add_generation_prompt -%}"
        "    <|im_start|>assistant\n"
        "{%- endif -%}"
    )

print("[OCR-LLM] Model and processor loaded successfully.")

def ocr_pdf(pdf_path: str) -> dict:
    print(f"[OCR-LLM] Starting OCR for: {pdf_path}")
    pages = convert_from_path(pdf_path, dpi=150)
    results = []

    for i, image in enumerate(pages, start=1):
        # Qwen2VL needs messages to contain image objects
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text",  "text": "Extract all text exactly as written."}
                ]
            }
        ]

        # Process vision info and apply chat template
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        image_inputs, video_inputs = process_vision_info(messages)
        
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to("cpu")

        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=1024)
        
        # Qwen2VL output decoding
        input_len = inputs.input_ids.shape[1]
        generated_ids = output_ids[:, input_len:]
        page_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        results.append({"page_number": i, "content": page_text})
        print(f"[OCR-LLM] Page {i}/{len(pages)} complete.")

    return {"pages": results}
