# ia/visor_camaras.py  — v2.0  Anti-false-positives edition
import argparse
import time
import requests
import cv2
import os
import sys
from datetime import datetime
from collections import deque
from ultralytics import YOLO

# ══════════════════════════════════════════════
#  RUTAS ABSOLUTAS
# ══════════════════════════════════════════════
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH     = os.path.join(BASE_DIR, 'restaurante_master.pt')
EVIDENCIAS_DIR = os.path.join(BASE_DIR, '..', 'evidencias')

# ══════════════════════════════════════════════
#  ARGUMENTOS
# ══════════════════════════════════════════════
parser = argparse.ArgumentParser()
parser.add_argument('--source',          type=str,   required=True)
parser.add_argument('--classes',         type=int,   nargs='+', required=True)
parser.add_argument('--camara_id',       type=int,   required=True)
parser.add_argument('--backend_url',     type=str,   default='http://localhost:3000')

# ── Umbrales de calidad ──────────────────────
parser.add_argument('--umbral_seg',      type=float, default=5.0,
                    help='Segundos sostenidos para disparar alerta (default 5)')
parser.add_argument('--conf_min',        type=float, default=0.60,
                    help='Confianza mínima para considerar detección (default 0.60)')
parser.add_argument('--cooldown_seg',    type=float, default=300.0,
                    help='Segundos de pausa entre alertas del MISMO track (default 300 = 5 min)')
parser.add_argument('--max_alertas_hora',type=int,   default=10,
                    help='Máximo de alertas por hora por cámara (default 10)')

# ── Clip ─────────────────────────────────────
parser.add_argument('--clip_pre',        type=int,   default=10,
                    help='Segundos a guardar ANTES del evento (default 10)')
parser.add_argument('--clip_post',       type=int,   default=20,
                    help='Segundos a grabar DESPUÉS del evento (default 20)')

# ── Zona de interés (ROI) ────────────────────
# Valores en porcentaje 0-100 del ancho/alto del frame
# Ejemplo: --roi 10 10 90 90  →  ignora el 10% de los bordes
parser.add_argument('--roi', type=int, nargs=4, default=None,
                    metavar=('X1_PCT', 'Y1_PCT', 'X2_PCT', 'Y2_PCT'),
                    help='Zona vigilada en %% del frame. Ej: --roi 5 5 95 95')

args = parser.parse_args()

# ══════════════════════════════════════════════
#  LOCK FILE  (evita procesos duplicados en Windows)
# ══════════════════════════════════════════════
LOCK_FILE = os.path.join(BASE_DIR, f'.lock_camara_{args.camara_id}')

def pid_vivo(pid: int) -> bool:
    """Verifica si un PID sigue activo en Windows."""
    try:
        import ctypes
        handle = ctypes.windll.kernel32.OpenProcess(0x0400, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    except Exception:
        return False

if os.path.exists(LOCK_FILE):
    try:
        old_pid = int(open(LOCK_FILE).read().strip())
        if pid_vivo(old_pid):
            print(f'[ERROR] Proceso duplicado detectado para camara {args.camara_id} '
                  f'(PID={old_pid}). Saliendo.', flush=True)
            sys.exit(1)
        else:
            print(f'[INFO] Lock huerfano (PID={old_pid} ya no existe). Limpiando.', flush=True)
            os.remove(LOCK_FILE)
    except Exception:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)

with open(LOCK_FILE, 'w') as f:
    f.write(str(os.getpid()))
print(f'[INFO] Lock creado — camara {args.camara_id} PID={os.getpid()}', flush=True)

# ══════════════════════════════════════════════
#  CARPETA DE EVIDENCIAS
# ══════════════════════════════════════════════
camara_dir = os.path.join(EVIDENCIAS_DIR, f'camara_{args.camara_id}')
os.makedirs(camara_dir, exist_ok=True)

# ══════════════════════════════════════════════
#  MODELO
# ══════════════════════════════════════════════
# Si no existe el modelo personalizado, cae al genérico
if not os.path.exists(MODEL_PATH):
    MODEL_PATH_FALLBACK = os.path.join(BASE_DIR, 'yolo11m.pt')
    print(f'[YOLO] Modelo personalizado no encontrado, usando generico: {MODEL_PATH_FALLBACK}', flush=True)
    MODEL_PATH_USE = MODEL_PATH_FALLBACK
else:
    MODEL_PATH_USE = MODEL_PATH
    print(f'[YOLO] Usando modelo personalizado: {MODEL_PATH_USE}', flush=True)

model = YOLO(MODEL_PATH_USE)
model.to('cuda:0')
print(f'[YOLO] Modelo listo en GPU. Clases vigiladas: {args.classes}', flush=True)
print(f'[CONFIG] umbral={args.umbral_seg}s | conf_min={args.conf_min} | '
      f'cooldown={args.cooldown_seg}s | max_alertas_hora={args.max_alertas_hora}', flush=True)

# ══════════════════════════════════════════════
#  WEBCAM
# ══════════════════════════════════════════════
def abrir_camara(source):
    """Abre la cámara con reintentos."""
    src = int(source) if str(source).isdigit() else source
    for intento in range(5):
        cap = cv2.VideoCapture(src)
        if cap.isOpened():
            return cap
        print(f'[CAM] No se pudo abrir (intento {intento+1}/5). Reintentando en 3s...', flush=True)
        time.sleep(3)
    return None

cap = abrir_camara(args.source)
if cap is None:
    print(f'[ERROR] No se pudo abrir la camara tras 5 intentos. Saliendo.', flush=True)
    os.remove(LOCK_FILE)
    sys.exit(1)

FPS    = cap.get(cv2.CAP_PROP_FPS) or 30.0
W      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
FOURCC = cv2.VideoWriter_fourcc(*'mp4v')
print(f'[CAM] {W}x{H} @ {FPS:.1f}fps', flush=True)

# ══════════════════════════════════════════════
#  ROI — Zona de interés
# ══════════════════════════════════════════════
if args.roi:
    x1_pct, y1_pct, x2_pct, y2_pct = args.roi
    ROI_X1 = int(W * x1_pct / 100)
    ROI_Y1 = int(H * y1_pct / 100)
    ROI_X2 = int(W * x2_pct / 100)
    ROI_Y2 = int(H * y2_pct / 100)
    print(f'[ROI] Zona activa: ({ROI_X1},{ROI_Y1}) → ({ROI_X2},{ROI_Y2}) '
          f'[{x1_pct}%,{y1_pct}% → {x2_pct}%,{y2_pct}%]', flush=True)
else:
    ROI_X1, ROI_Y1, ROI_X2, ROI_Y2 = 0, 0, W, H
    print(f'[ROI] Sin zona definida — vigilando frame completo', flush=True)

def bbox_en_roi(box) -> bool:
    """Verifica si el centro del bounding box cae dentro de la ROI."""
    x1, y1, x2, y2 = box.xyxy[0].tolist()
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    return ROI_X1 <= cx <= ROI_X2 and ROI_Y1 <= cy <= ROI_Y2

# ══════════════════════════════════════════════
#  ESTADO — Buffers y contadores
# ══════════════════════════════════════════════
PRE_FRAMES = int(FPS * args.clip_pre)
buffer_pre = deque(maxlen=PRE_FRAMES)

grabando_para    = {}   # track_id → {writer, frames_restantes, ruta, clase_id}
timers           = {}   # track_id → {inicio, clase_id, confianza_max}
cooldowns        = {}   # track_id → timestamp de última alerta enviada
alertas_enviadas = set()

# Contador para límite por hora
alertas_esta_hora  = 0
inicio_hora_actual = time.time()

prev_time          = time.time()
frames_sin_lectura = 0   # para reconexión automática

# ══════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════
def resetear_contador_hora():
    global alertas_esta_hora, inicio_hora_actual
    ahora = time.time()
    if ahora - inicio_hora_actual >= 3600:
        alertas_esta_hora  = 0
        inicio_hora_actual = ahora
        print(f'[INFO] Contador de alertas/hora reiniciado', flush=True)

def puede_alertar(track_id: int) -> bool:
    """
    Devuelve True solo si:
    1. No estamos en cooldown para este track
    2. No superamos el límite de alertas por hora
    """
    resetear_contador_hora()

    # Límite por hora (protección global de spam)
    if alertas_esta_hora >= args.max_alertas_hora:
        print(f'[THROTTLE] Limite de {args.max_alertas_hora} alertas/hora alcanzado. '
              f'Esperando reset en {int(3600 - (time.time() - inicio_hora_actual))}s', flush=True)
        return False

    # Cooldown por track individual
    if track_id in cooldowns:
        elapsed = time.time() - cooldowns[track_id]
        if elapsed < args.cooldown_seg:
            restante = int(args.cooldown_seg - elapsed)
            print(f'[COOLDOWN] Track {track_id} en cooldown — {restante}s restantes', flush=True)
            return False

    return True

# ══════════════════════════════════════════════
#  GRABACIÓN DE CLIPS
# ══════════════════════════════════════════════
def iniciar_grabacion(track_id: int, clase_id: int):
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    nombre    = f'track{track_id}_clase{clase_id}_{timestamp}.mp4'
    ruta      = os.path.join(camara_dir, nombre)
    writer    = cv2.VideoWriter(ruta, FOURCC, FPS, (W, H))

    # Vuelca el buffer pre-evento
    for f in buffer_pre:
        writer.write(f)

    grabando_para[track_id] = {
        'writer':           writer,
        'frames_restantes': int(FPS * args.clip_post),
        'ruta':             ruta,
        'clase_id':         clase_id,
    }
    print(f'[CLIP] Iniciando grabacion: {nombre}', flush=True)

def convertir_a_web(ruta_mp4: str) -> str:
    """Convierte el .mp4 con codec mp4v a H.264 compatible con navegadores."""
    ruta_web = ruta_mp4.replace('.mp4', '_web.mp4')
    ret = os.system(
        f'ffmpeg -y -i "{ruta_mp4}" '
        f'-vcodec libx264 -preset fast -crf 28 '
        f'-movflags +faststart '          # ← permite reproducción antes de descargar
        f'"{ruta_web}" >nul 2>&1'
    )
    if ret == 0 and os.path.exists(ruta_web):
        os.remove(ruta_mp4)
        os.rename(ruta_web, ruta_mp4)
        print(f'[CLIP] Convertido a H.264 web OK', flush=True)
    else:
        print(f'[CLIP] ffmpeg fallo (cod={ret}), usando video sin convertir', flush=True)
    return ruta_mp4

def finalizar_grabacion(track_id: int, confianza: float, duracion: float):
    global alertas_esta_hora
    datos    = grabando_para.pop(track_id)
    datos['writer'].release()
    ruta     = datos['ruta']
    clase_id = datos['clase_id']

    print(f'[CLIP] Guardado: {os.path.basename(ruta)}', flush=True)
    ruta = convertir_a_web(ruta)

    ruta_relativa = os.path.relpath(ruta, os.path.join(BASE_DIR, '..'))
    ruta_relativa = ruta_relativa.replace('\\', '/')

    enviar_alerta(args.camara_id, clase_id, confianza, duracion, ruta_relativa)

    # Registrar cooldown y contador
    cooldowns[track_id] = time.time()
    alertas_esta_hora  += 1
    print(f'[INFO] Alertas esta hora: {alertas_esta_hora}/{args.max_alertas_hora}', flush=True)

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
            json=payload,
            timeout=5,
        )
        if r.status_code == 201:
            print(f'[API] Alerta enviada OK (clase={clase_id} conf={confianza:.2f} '
                  f'dur={duracion:.1f}s)', flush=True)
        else:
            print(f'[API] Error HTTP {r.status_code}: {r.text[:100]}', flush=True)
    except Exception as e:
        print(f'[API] Sin conexion al backend: {e}', flush=True)

# ══════════════════════════════════════════════
#  BUCLE PRINCIPAL
# ══════════════════════════════════════════════
print(f'[INFO] Sistema listo. Iniciando monitoreo...', flush=True)

try:
    while True:
        ret, frame = cap.read()

        # ── Reconexión automática si la cámara falla ──
        if not ret:
            frames_sin_lectura += 1
            print(f'[CAM] Frame fallido #{frames_sin_lectura}', flush=True)
            if frames_sin_lectura >= 30:
                print(f'[CAM] Demasiados frames fallidos. Reconectando...', flush=True)
                cap.release()
                time.sleep(3)
                cap = abrir_camara(args.source)
                if cap is None:
                    print(f'[CAM] No se pudo reconectar. Saliendo.', flush=True)
                    break
                FPS = cap.get(cv2.CAP_PROP_FPS) or 30.0
                frames_sin_lectura = 0
                print(f'[CAM] Reconectado OK', flush=True)
            time.sleep(0.1)
            continue

        frames_sin_lectura = 0

        # ── FPS real ──
        curr_time = time.time()
        fps_real  = 1.0 / max(curr_time - prev_time, 1e-9)
        prev_time = curr_time
        print(f'[FPS] {fps_real:.1f} | alertas_hora={alertas_esta_hora}/{args.max_alertas_hora}', flush=True)

        # ── Buffer pre-evento ──
        buffer_pre.append(frame.copy())

        # ── Inferencia ──
        results = model.track(
            source   = frame,
            classes  = args.classes,
            device   = 0,
            persist  = True,
            verbose  = False,
            conf     = args.conf_min,   # ← filtra por confianza DENTRO de YOLO
        )

        ids_en_frame = set()

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes

            for i in range(len(boxes)):
                conf_det  = float(boxes.conf[i].item())
                track_id  = int(boxes.id[i].item())
                clase_id  = int(boxes.cls[i].item())

                # ── Filtro 1: Confianza mínima (doble check) ──
                if conf_det < args.conf_min:
                    continue

                # ── Filtro 2: ROI — ¿está el objeto dentro de la zona? ──
                if not bbox_en_roi(boxes[i]):
                    continue

                ids_en_frame.add(track_id)

                # ── Timer de detección sostenida ──
                if track_id not in timers:
                    timers[track_id] = {
                        'inicio':        time.time(),
                        'clase_id':      clase_id,
                        'confianza_max': conf_det,
                    }
                    print(f'[TRACK] Nuevo objeto detectado — id={track_id} '
                          f'clase={clase_id} conf={conf_det:.2f}', flush=True)
                else:
                    timers[track_id]['confianza_max'] = max(
                        timers[track_id]['confianza_max'], conf_det
                    )
                    duracion = time.time() - timers[track_id]['inicio']

                    # ── Filtro 3: Tiempo sostenido + cooldown + límite hora ──
                    if (duracion >= args.umbral_seg
                            and track_id not in alertas_enviadas
                            and puede_alertar(track_id)):

                        alertas_enviadas.add(track_id)
                        print(f'[ALERTA] Infraccion confirmada — '
                              f'track={track_id} clase={clase_id} '
                              f'dur={duracion:.1f}s conf={conf_det:.2f}', flush=True)
                        iniciar_grabacion(track_id, clase_id)

        # ── Escribir frame en clips activos ──
        terminados = []
        for tid, datos in grabando_para.items():
            datos['writer'].write(frame.copy())
            datos['frames_restantes'] -= 1
            if datos['frames_restantes'] <= 0:
                terminados.append(tid)

        for tid in terminados:
            td = timers.get(tid, {})
            finalizar_grabacion(
                track_id  = tid,
                confianza = td.get('confianza_max', 0.0),
                duracion  = time.time() - td.get('inicio', time.time()),
            )

        # ── Limpiar tracks desaparecidos ──
        desaparecidos = set(timers.keys()) - ids_en_frame
        for tid in desaparecidos:
            # Si desaparece pero estaba siendo grabado, no lo borramos del timer
            # hasta que el clip termine
            if tid not in grabando_para:
                print(f'[TRACK] Objeto perdido — id={tid}', flush=True)
                del timers[tid]
                alertas_enviadas.discard(tid)

finally:
    print(f'[INFO] Apagando sistema de camara {args.camara_id}...', flush=True)

    # Cerrar todos los VideoWriters abiertos
    for tid, datos in grabando_para.items():
        try:
            datos['writer'].release()
            print(f'[CLIP] Writer de track {tid} cerrado', flush=True)
        except Exception:
            pass

    cap.release()
    cv2.destroyAllWindows()

    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)

    print(f'[INFO] Camara {args.camara_id} apagada limpiamente.', flush=True)