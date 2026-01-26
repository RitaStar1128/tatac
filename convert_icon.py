from PIL import Image
import os

# 入力ファイルパス
input_path = '/home/ubuntu/tatac/client/public/images/icon-tatac-generated.png'
# 出力ファイルパス
output_path = '/home/ubuntu/tatac/client/public/favicon.ico'

try:
    img = Image.open(input_path)
    # ICOファイルには複数のサイズを含めるのが一般的
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    img.save(output_path, format='ICO', sizes=icon_sizes)
    print(f"Successfully converted {input_path} to {output_path}")
except Exception as e:
    print(f"Error converting image: {e}")
