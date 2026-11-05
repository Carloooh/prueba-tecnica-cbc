# Respuestas a Parte 2 – Diseño y Trade-offs

> **Escenario:** El servicio monitorea 40 fuentes distintas, cada una con su propio formato. Algunas tardan hasta 20 minutos en responder, una cambia su estructura sin avisar cada pocas semanas, y unas 5 personas consultarán los datos diariamente.

---

### 1. ¿Cómo organizarías el código para agregar una fuente nueva con el menor esfuerzo posible?

Mantendría una ruta donde tenga los archivos de cada fuente agrupados en sus propias carpetas con sus archivos para poder realizar la conexión, el proceso de ETL y llevarlos o al flujo de almacenamiento, deduplicidad y descarte en conjunto al resto de datos, o procesarlos por su cuenta y poder estandarizarlos al formato utilizado por el sistema. Así, si hay que sí se necesita añadir otra fuente, bastaría con crearle su carpeta y archivos con el código correspondiente.

---

### 2. ¿Dónde ejecutarías las ingestas en la nube (Azure) y cómo te enterarías de que una fuente dejó de funcionar o cambió de formato?

Investigué un poco antes de responder, y las funciones en el servidor o llamadas a API tras cierto tiempo prolongado pueden producir timeout y al haber una fuente que tarda 20 mins, sería problemático, por lo que una buena opción a evaluar sería usar en Azure Container Apps con jobs programados para realizar la ingesta de datos mientras se requiera, y luego se podría apagar el contenedor para ahorrar recursos al haber tan pocos usuarios que consulten la información.

Podría enterarme de que una fuente no funciona mediante registros de errores/éxito y/o monitoreo de la ingesta de datos mediante servicios de Azure como Application Insights por ejemplo, o un servicio que notifique y permita observar cuando hay fallos en el sistema. También podría ser que el propio archivo de registros rechazados crezca mucho su tamaño y podría ser señal de un problema relacionado a cambio de formato.

---

### 3. Si tuvieras solo 2 días para llevar esto a producción, ¿qué dejarías fuera y qué no negociarías?

#### Lo que NO negociaría:

-Lo importante es la calidad de la información, por lo que no dejaría de lado que el proceso ETL sea el adecuado para el formato de datos estándar y las validaciones.

-Tampoco dejaría de lado la seguridad, control de acceso a la información y protección en los protocolos de comunicación. Ni los mensajes de error/registro de errores al conectarse con las fuentes, la información siempre tiene que estar disponible para los usuarios.

#### Lo que dejaría fuera (para después):

-Dejaría para el futuro un poco de deuda técnica, no buscaría hacer una arquitectura muy compleja con múltiples servicios o funcionalidades, que funcione lo básico y mínimo para que el sistema disponga de la información.

-La conexión a las fuentes las haría "sencillas", no aprueba de balas, de inicio no me preocuparía con que vayan a cambiar el formato de los datos, o forma de conectarse, fallos que hayan, se pueden solucionar y ajustar manualmente cuando suceda un incidente.
