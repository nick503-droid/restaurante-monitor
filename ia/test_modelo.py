# ia/test_modelo.py
# Script de prueba rápida — solo para verificar que YOLO funciona
from ultralytics import YOLO
import cv2

print("Cargando modelo...")
model = YOLO("ia/yolo11m.pt")  # El archivo que descargaste antes
model.to("cuda:0")
print("Modelo cargado en GPU ✓")

# Abrir webcam
cap = cv2.VideoCapture(0)
print("Webcam abierta. Presiona Q para salir.")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Inferencia sin filtrar clases (muestra todo lo que detecta)
    results = model(frame, device=0, verbose=False)

    # Dibujar los resultados en el frame
    frame_anotado = results[0].plot()

    cv2.imshow("Test YOLO - RTX 3050", frame_anotado)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("Test terminado.")