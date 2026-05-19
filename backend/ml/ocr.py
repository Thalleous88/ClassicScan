import pandas as pd
import numpy as np
import cv2
import pytesseract
import os

from dotenv import load_dotenv

load_dotenv()

pytesseract.pytesseract.tesseract_cmd = (
    rf"{os.getenv('TESSERACT_PATH')}"
)

from matplotlib import pyplot as plt

img = cv2.imread("test.png", 0)

import cv2
import numpy as np


def preprocess_for_ocr(image_path):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")

    

    return img


processed = preprocess_for_ocr("test2.jpg")

text = pytesseract.image_to_string(processed, config="--oem 3 --psm 6")
print(text)