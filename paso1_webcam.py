# Paso 1: comprobar que OpenCV puede abrir la webcam y mostrar video.
# Pulsa la tecla "q" para salir.
import cv2

# 0 = primera camara del sistema. Si no abre, prueba con 1.
# CAP_DSHOW (DirectShow) suele abrir mas rapido la camara en Windows.
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

if not cap.isOpened():
    print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
    raise SystemExit(1)

print("Camara abierta. Pulsa 'q' en la ventana para salir.")

while True:
    ok, frame = cap.read()  # ok = True si llego un frame; frame = la imagen (array de NumPy)
    if not ok:
        print("ERROR: la camara no devolvio imagen.")
        break

    frame = cv2.flip(frame, 1)  # efecto espejo, mas natural para ti
    alto, ancho = frame.shape[:2]
    cv2.putText(frame, f"{ancho}x{alto} - pulsa q para salir", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    cv2.imshow("Paso 1 - Webcam", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
