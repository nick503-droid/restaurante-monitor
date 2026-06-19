# ia/visor_camaras.py
import argparse
import time
import requests
import cv2
import os
import sys
from datetime import datetime
from collections import deque
from ultralytics import YOLO

# - Rutas absolutas -
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH     = os.path.join(BASE_DIR, 'yolo11m.pt')
# Carpeta de evidencias: restaurante-monitor/evidencias/
EVIDENCIAS_DIR = os.path.join(BASE_DIR, '..', 'evidencias')

# - Argumentos -
parser = argparse.ArgumentParser()
parser.add_argument('--source',      type=str,   required=True)
parser.add_argument('--classes',     type=int,   nargs='+', required=True)
parser.add_argument('--camara_id',   type=int,   required=True)
parser.add_argument('--umbral_seg',  type=float, default=3.0)
parser.add_argument('--clip_pre',    type=int,   default=10)  # segundos antes
parser.add_argument('--clip_post',   type=int,   default=20)  # segundos despues
parser.add_argument('--backend_url', type=str,   default='http://localhost:3000')
args = parser.parse_args()

# - Lock file para evitar procesos duplicados (Enfoque Windows) -
LOCK_FILE = os.path.join(BASE_DIR, f'.lock_camara_{args.camara_id}')

# Si el lock ya existe, verificamos si es un fantasma o si sigue vivo
if os.path.exists(LOCK_FILE):
    try:
        with open(LOCK_FILE, 'r') as f:
            old_pid = int(f.read().strip())
        
        # En Windows, verificamos si el PID sigue corriendo
        import ctypes
        PROCESS_QUERY_INFORMATION = 0x0400
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, old_pid)
        if handle != 0:
            ctypes.windll.kernel32.CloseHandle(handle)
            print(f'[ERROR] Ya existe un proceso activo para la camara {args.camara_id} (PID={old_pid})', flush=True)
            sys.exit(1)
        else:
            print(f'[INFO] Lock huerfano detectado de un proceso muerto (PID={old_pid}). Limpiando...', flush=True)
            os.remove(LOCK_FILE)
    except Exception:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)

# Creamos nuestro nuevo lock con el PID actual
with open(LOCK_FILE, 'w') as f:
    f.write(str(os.getpid()))
print(f'[INFO] Lock creado para la camara {args.camara_id} (PID={os.getpid()})', flush=True)

# - Carpeta de esta camara -
camara_dir = os.path.join(EVIDENCIAS_DIR, f'camara_{args.camara_id}')
os.makedirs(camara_dir, exist_ok=True)

# - Cargar modelo -
print(f'[YOLO] Cargando modelo...', flush=True)
model = YOLO(MODEL_PATH)
model.to('cuda:0')
print(f'[YOLO] Modelo listo. Clases: {args.classes}', flush=True)

# - Abrir video -
source = int(args.source) if args.source.isdigit() else args.source
cap    = cv2.VideoCapture(source)

if not cap.isOpened():
    print(f'[ERROR] No se puede abrir la fuente de video: {args.source}', flush=True)
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)
    sys.exit(1)

# - Propiedades del video -
FPS    = cap.get(cv2.CAP_PROP_FPS) or 30.0
W      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
FOURCC = cv2.VideoWriter_fourcc(*'mp4v')

print(f'[CAM] {W}x{H} @ {FPS:.1f}fps', flush=True)

# - Buffer circular -
PRE_FRAMES = int(FPS * args.clip_pre)   # ej: 30fps * 10s = 300 frames
buffer_pre = deque(maxlen=PRE_FRAMES)

# - Estado de grabacion -
grabando_para = {}

# - Timers de deteccion -
timers           = {}
alertas_enviadas = set()
prev_time        = time.time()


def iniciar_grabacion(track_id: int, clase_id: int):
    """Crea el VideoWriter y vuelca el buffer pre-evento."""
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    nombre    = f'track{track_id}_clase{clase_id}_{timestamp}.mp4'
    ruta      = os.path.join(camara_dir, nombre)

    writer = cv2.VideoWriter(ruta, FOURCC, FPS, (W, H))

    # Escribe los frames del buffer (los 10s previos)
    for frame_guardado in buffer_pre:
        writer.write(frame_guardado)

    frames_post = int(FPS * args.clip_post)  # 20s * 30fps = 600 frames

    grabando_para[track_id] = {
        'writer':           writer,
        'frames_restantes': frames_post,
        'ruta':             ruta,
        'clase_id':         clase_id,
    }

    print(f'[CLIP] Grabando evidencia: {nombre}', flush=True)
    return ruta


def finalizar_grabacion(track_id: int, confianza: float, duracion: float):
    """Cierra el writer y envia la alerta con la ruta del clip."""
    datos     = grabando_para.pop(track_id)
    datos['writer'].release()
    ruta      = datos['ruta']
    clase_id  = datos['clase_id']

    print(f'[CLIP] Clip guardado: {ruta}', flush=True)

    # Ruta relativa para guardar en la DB
    ruta_relativa = os.path.relpath(ruta, os.path.join(BASE_DIR, '..'))

    enviar_alerta(
        camara_id  = args.camara_id,
        clase_id   = clase_id,
        confianza  = confianza,
        duracion   = duracion,
        ruta_clip  = ruta_relativa.replace('\\', '/'),  # formato Unix para la DB
    )


def enviar_alerta(camara_id, clase_id, confianza, duracion, ruta_clip):
    try:
        payload = {
            'camaraId':        camara_id,
            'catalogoClaseId': clase_id,
            'confianza':       round(confianza, 4),
            'duracion_seg':    round(duracion, 2),
            'rutaClip':        ruta_clip,
        }
        r = requests.post(
            f'{args.backend_url}/api/alertas',
            json    = payload,
            timeout = 5,
        )
        if r.status_code == 201:
            print(f'[API] Alerta + clip enviados OK', flush=True)
        else:
            print(f'[API] Error {r.status_code}', flush=True)
    except Exception as e:
        print(f'[API] Sin conexion: {e}', flush=True)


# - Bucle principal protegido con try/finally -
try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print('[CAM] No se pudo leer frame', flush=True)
            time.sleep(0.5)
            continue

        # FPS en consola
        curr_time = time.time()
        fps_real  = 1.0 / (curr_time - prev_time + 1e-9)
        prev_time = curr_time
        print(f'[FPS] {fps_real:.1f} | CAM {args.camara_id}', flush=True)

        # Guardar frame en buffer pre-evento SIEMPRE
        buffer_pre.append(frame.copy())

        # - Inferencia -
        results = model.track(
            source  = frame,
            classes = args.classes,
            device  = 0,
            persist = True,
            verbose = False,
        )

        ids_en_frame = set()

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes
            for i in range(len(boxes)):
                track_id  = int(boxes.id[i].item())
                clase_id  = int(boxes.cls[i].item())
                confianza = float(boxes.conf[i].item())
                ids_en_frame.add(track_id)

                # - Timer de deteccion -
                if track_id not in timers:
                    timers[track_id] = {
                        'inicio':        time.time(),
                        'clase_id':      clase_id,
                        'confianza_max': confianza,
                    }
                    print(f'[TRACK] Nuevo: id={track_id} clase={clase_id}', flush=True)
                else:
                    timers[track_id]['confianza_max'] = max(
                        timers[track_id]['confianza_max'], confianza
                    )
                    duracion = time.time() - timers[track_id]['inicio']

                    # Umbral superado -> iniciar grabacion de clip
                    if duracion >= args.umbral_seg and track_id not in alertas_enviadas:
                        alertas_enviadas.add(track_id)
                        print(f'[ALERTA] clase={clase_id} dur={duracion:.1f}s', flush=True)
                        iniciar_grabacion(track_id, clase_id)

        # - Escribir frame en clips activos -
        terminados = []
        for track_id, datos in grabando_para.items():
            datos['writer'].write(frame.copy())
            datos['frames_restantes'] -= 1

            if datos['frames_restantes'] <= 0:
                terminados.append(track_id)

        # Finalizar clips que ya completaron los 20s post-evento
        for track_id in terminados:
            timer_data = timers.get(track_id, {})
            finalizar_grabacion(
                track_id  = track_id,
                confianza = timer_data.get('confianza_max', 0.0),
                duracion  = time.time() - timer_data.get('inicio', time.time()),
            )

        # - Limpiar objetos desaparecidos -
        for track_id in set(timers.keys()) - ids_en_frame:
            print(f'[TRACK] Perdido: id={track_id}', flush=True)
            del timers[track_id]
            alertas_enviadas.discard(track_id)

finally:
    # ESTO SE EJECUTA SIEMPRE, INCLUSO SI REINICIAS EL CODIGO O DA ERROR
    print(f'[INFO] Liberando recursos de la camara {args.camara_id}...', flush=True)
    
    # Cerrar todos los VideoWriters que hayan quedado abiertos
    for track_id, datos in grabando_para.items():
        try:
            datos['writer'].release()
        except:
            pass
            
    cap.release()
    cv2.destroyAllWindows()
    
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)
    print(f'[INFO] Lock liberado con exito para camara {args.camara_id}', flush=True)