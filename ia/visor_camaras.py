# ia/visor_camaras.py  — v3.2 Live CCTV & DroidCam Edition
import argparse
import time
import requests
import cv2
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime
from collections import deque
from ultralytics import YOLO

# - RUTAS ABSOLUTAS -
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH     = os.path.join(BASE_DIR, 'restaurante_master.pt')
EVIDENCIAS_DIR = os.path.join(BASE_DIR, '..', 'evidencias')

# - ARGUMENTOS -
parser = argparse.ArgumentParser()
parser.add_argument('--source',          type=str,   required=True)
parser.add_argument('--classes',         type=int,   nargs='+', required=True)
parser.add_argument('--camara_id',       type=int,   required=True)
parser.add_argument('--backend_url',     type=str,   default='http://localhost:3000')
parser.add_argument('--stream_port',     type=int,   default=5000)
parser.add_argument('--umbral_seg',      type=float, default=5.0)
parser.add_argument('--conf_min',        type=float, default=0.60)
parser.add_argument('--cooldown_seg',    type=float, default=300.0)
parser.add_argument('--max_alertas_hora',type=int,   default=10)
parser.add_argument('--clip_pre',        type=int,   default=10)
parser.add_argument('--clip_post',       type=int,   default=20)
parser.add_argument('--roi', type=int, nargs=4, default=None)
args = parser.parse_args()

# - LOCK FILE -
LOCK_FILE = os.path.join(BASE_DIR, f'.lock_camara_{args.camara_id}')
if os.path.exists(LOCK_FILE):
    try:
        os.remove(LOCK_FILE)
    except:
        pass
with open(LOCK_FILE, 'w') as f:
    f.write(str(os.getpid()))

camara_dir = os.path.join(EVIDENCIAS_DIR, f'camara_{args.camara_id}')
os.makedirs(camara_dir, exist_ok=True)

if not os.path.exists(MODEL_PATH):
    MODEL_PATH = os.path.join(BASE_DIR, 'yolo11m.pt')

model = YOLO(MODEL_PATH)
model.to('cuda:0')

# - SERVIDOR DE STREAMING (CCTV EN VIVO) -
stream_frame = None
stream_lock = threading.Lock()

class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Evita llenar la consola de logs HTTP

    def do_GET(self):
        global stream_frame
        if self.path == '/video_feed':
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Access-Control-Allow-Origin', '*') 
            self.end_headers()
            try:
                while True:
                    with stream_lock:
                        if stream_frame is None:
                            time.sleep(0.1)
                            continue
                        # Comprimir a JPEG calidad 70% para streaming fluido
                        ret, jpeg = cv2.imencode('.jpg', stream_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                        frame_jpg = jpeg.tobytes()

                    self.wfile.write(b'--frame\r\n')
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('Content-Length', len(frame_jpg))
                    self.end_headers()
                    self.wfile.write(frame_jpg)
                    self.wfile.write(b'\r\n')
                    time.sleep(0.04) # Límite ~25 FPS
            except Exception as e:
                pass # El navegador cerró la pestaña
        else:
            self.send_response(404)
            self.end_headers()

def iniciar_streaming():
    server = HTTPServer(('0.0.0.0', args.stream_port), MJPEGHandler)
    print(f"[STREAM] CCTV en vivo puerto: {args.stream_port} activo", flush=True)
    server.serve_forever()

threading.Thread(target=iniciar_streaming, daemon=True).start()

# - WEBCAM CON REINTENTOS Y SOPORTE VIRTUAL -
def abrir_camara(source):
    src = int(source) if str(source).isdigit() else source
    print(f'[CAM {args.camara_id}] Intentando conectar a: {src}', flush=True)
    
    for intento in range(5):
        if isinstance(src, int):
            # 1. Intentamos con DSHOW (Ideal para tu webcam principal de laptop)
            cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
            if not cap.isOpened():
                # 2. Si DSHOW crashea (porque es DroidCam/Virtual), usamos el estándar
                cap = cv2.VideoCapture(src)
        else:
            # Para conexiones IP puras
            cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                cap = cv2.VideoCapture(src)

        if cap.isOpened():
            print(f'[CAM {args.camara_id}] Conexión exitosa a la cámara', flush=True)
            return cap
            
        print(f'[CAM {args.camara_id}] Falló intento {intento+1}/5. Reintentando en 3s...', flush=True)
        time.sleep(3)
        
    return None

cap = abrir_camara(args.source)
if cap is None:
    print(f'[ERROR] Imposible acceder a la cámara {args.source}. Verifique la IP o conexión.', flush=True)
    sys.exit(1)
    

FPS = cap.get(cv2.CAP_PROP_FPS) or 30.0
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
FOURCC = cv2.VideoWriter_fourcc(*'VP80')

PRE_FRAMES = int(FPS * args.clip_pre)
buffer_pre = deque(maxlen=PRE_FRAMES)
grabando_para, timers, cooldowns, alertas_enviadas = {}, {}, {}, set()
alertas_esta_hora, inicio_hora_actual, prev_time = 0, time.time(), time.time()

# - HELPERS DE ALERTAS -
def resetear_contador_hora():
    global alertas_esta_hora, inicio_hora_actual
    ahora = time.time()
    if ahora - inicio_hora_actual >= 3600:
        alertas_esta_hora, inicio_hora_actual = 0, ahora

def iniciar_grabacion(track_id: int, clase_id: int):
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    ruta = os.path.join(camara_dir, f'track{track_id}_clase{clase_id}_{timestamp}.webm')
    writer = cv2.VideoWriter(ruta, FOURCC, FPS, (W, H))
    for f in buffer_pre: writer.write(f)
    grabando_para[track_id] = {'writer': writer, 'frames_restantes': int(FPS * args.clip_post), 'ruta': ruta, 'clase_id': clase_id}

def finalizar_grabacion(track_id: int, confianza: float, duracion: float):
    global alertas_esta_hora
    datos = grabando_para.pop(track_id)
    datos['writer'].release()
    ruta_relativa = os.path.relpath(datos['ruta'], os.path.join(BASE_DIR, '..')).replace('\\', '/')
    try:
        requests.post(f'{args.backend_url}/api/alertas', json={
            'camaraId': args.camara_id, 'catalogoClaseId': datos['clase_id'],
            'confianza': round(confianza, 4), 'duracion_seg': round(duracion, 2), 'rutaClip': ruta_relativa
        }, timeout=5)
    except: pass
    cooldowns[track_id], alertas_esta_hora = time.time(), alertas_esta_hora + 1

# - BUCLE PRINCIPAL -
try:
    while True:
        ret, frame = cap.read()
        if not ret: continue

        curr_time = time.time()
        fps_real = 1.0 / max(curr_time - prev_time, 1e-9)
        prev_time = curr_time

        frame_para_video = frame.copy()
        buffer_pre.append(frame_para_video)

        results = model.track(source=frame, classes=args.classes, device=0, persist=True, verbose=False, conf=args.conf_min)
        ids_en_frame = set()

        if results[0].boxes is not None and results[0].boxes.id is not None:
            frame_para_video = results[0].plot() 
            buffer_pre[-1] = frame_para_video

            for i in range(len(results[0].boxes)):
                conf_det = float(results[0].boxes.conf[i].item())
                track_id, clase_id = int(results[0].boxes.id[i].item()), int(results[0].boxes.cls[i].item())
                if conf_det < args.conf_min: continue

                ids_en_frame.add(track_id)
                if track_id not in timers:
                    timers[track_id] = {'inicio': time.time(), 'clase_id': clase_id, 'confianza_max': conf_det}
                else:
                    timers[track_id]['confianza_max'] = max(timers[track_id]['confianza_max'], conf_det)
                    duracion = time.time() - timers[track_id]['inicio']
                    resetear_contador_hora()
                    
                    if duracion >= args.umbral_seg and track_id not in alertas_enviadas and alertas_esta_hora < args.max_alertas_hora:
                        if track_id not in cooldowns or (time.time() - cooldowns[track_id]) >= args.cooldown_seg:
                            alertas_enviadas.add(track_id)
                            iniciar_grabacion(track_id, clase_id)

        with stream_lock:
            stream_frame = frame_para_video.copy()

        terminados = []
        for tid, datos in grabando_para.items():
            datos['writer'].write(frame_para_video)
            datos['frames_restantes'] -= 1
            if datos['frames_restantes'] <= 0: terminados.append(tid)

        for tid in terminados:
            td = timers.get(tid, {})
            finalizar_grabacion(tid, td.get('confianza_max', 0.0), time.time() - td.get('inicio', time.time()))

        for tid in set(timers.keys()) - ids_en_frame:
            if tid not in grabando_para:
                del timers[tid]
                alertas_enviadas.discard(tid)

finally:
    for tid, datos in grabando_para.items():
        try: datos['writer'].release()
        except: pass
    cap.release()
    cv2.destroyAllWindows()
    if os.path.exists(LOCK_FILE): os.remove(LOCK_FILE)