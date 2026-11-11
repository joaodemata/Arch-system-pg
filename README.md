# Arch System PG

Juego educativo tipo puzzle: construye la arquitectura de un sistema con bloques (servidores, balanceadores, cachés, bases de datos…) y comprueba con una simulación de tráfico si aguanta.

## Cómo jugar
Abre `index.html` en el navegador. No hace falta instalar nada.

- Añade bloques desde la paleta.
- Toca un bloque y luego otro para conectarlos (la dirección se ajusta sola).
- Pulsa **Simular tráfico**.

## Puntuación
La simulación decide si la arquitectura es válida (porcentaje de peticiones respondidas y latencia media). Las estrellas comparan el coste con la solución de referencia del nivel (el "par"):

- ⭐ cumple los requisitos
- ⭐⭐ coste ≤ 125 % del par
- ⭐⭐⭐ coste ≤ par

## Niveles
1. Tu primer servidor
2. Te has hecho viral (balanceador de carga + escalado horizontal)
3. La base de datos sufre (caché)
