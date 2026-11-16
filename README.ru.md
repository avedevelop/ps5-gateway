# PS5 Gateway

Картинка с PS5 в **OBS** по домашней сети, без платы захвата, а дальше стрим на Twitch из OBS.

У PS5 есть встроенная трансляция на Twitch, но без оверлеев, алертов и сцен. PS5 Gateway незаметно перенаправляет эту трансляцию на ваш ПК с Windows или Mac. OBS открывает её как обычный Media Source, и дальше всё как в обычном OBS: сцены, оверлеи, чат, StreamElements, Streamlabs, DonationAlerts, запись, фильтры.

> English version: [README.md](README.md)

```
PS5 «Трансляция» ──DNS-подмена──▶ ваш ПК
                                   ├─ CoreDNS     отвечает PS5 адресом ПК вместо сервера Twitch
                                   ├─ MediaMTX    принимает поток PS5 (порт 1935)
                                   └─ Оркестратор держит их запущенными, пересылает поток, показывает панель
                                            │
                                            ▼
                    rtmp://<ПК>:1935/ps5/game ──▶ OBS (Media Source) ──▶ Twitch
                                                  (вы нажимаете «Начать трансляцию»)
```

Шлюз сам ничего не отправляет на Twitch. Пока OBS не запущен в эфир, ничего не публично.

## Быстрый старт

### Установщик в один клик

Скачайте архив для своей системы со [страницы последнего релиза](https://github.com/avedevelop/ps5-gateway/releases/latest), распакуйте и запустите установщик. Он проверит Node.js, FFmpeg и OBS, скачает вспомогательные программы, создаст настройки, запустит шлюз, прогонит `doctor` и создаст сцену OBS. Адрес PS5 он спросит сам, а перед каждым шагом, который меняет систему, попросит разрешения.

| | Что скачать | Что запустить |
|---|---|---|
| **Windows 10 / 11** | `ps5-gateway-windows-<версия>.zip` | двойной щелчок по `installer\windows\Install-PS5-Gateway.cmd` |
| **macOS** (Apple silicon или Intel) | `ps5-gateway-macos-<версия>.tar.gz` | двойной щелчок по `installer/macos/Install PS5 Gateway.command` (в первый раз: правый клик → «Открыть») |

Хотите видеть каждый шаг? Команды ниже.

### По шагам

Нужны Windows 10/11 **или** macOS, [Node.js 24 LTS](https://nodejs.org), [OBS Studio](https://obsproject.com) и PS5 в той же сети, что и компьютер.

**Windows**

```powershell
git clone https://github.com/avedevelop/ps5-gateway.git
cd ps5-gateway
node scripts\setup.mjs --ps5-ip=192.168.1.50      # скачает FFmpeg, MediaMTX, CoreDNS, создаст .env
powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1   # PowerShell от администратора, один раз
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
node scripts\doctor.mjs                           # проверит всю цепочку
node scripts\make-obs-scenes.mjs <IP ПК> --lang=ru   # коллекция сцен «PS5» в OBS
```

**macOS** (Apple silicon или Intel; FFmpeg ставится через [Homebrew](https://brew.sh))

```bash
git clone https://github.com/avedevelop/ps5-gateway.git
cd ps5-gateway
brew install ffmpeg
node scripts/setup.mjs --ps5-ip=192.168.1.50      # скачает MediaMTX и CoreDNS, создаст .env
sh scripts/start.sh                               # права администратора не нужны
node scripts/doctor.mjs                           # проверит всю цепочку
node scripts/make-obs-scenes.mjs <IP Mac> --lang=ru   # коллекция сцен «PS5» в OBS
```

Дальше на PS5 укажите DNS вашего подключения: адрес ПК (его покажет setup), запустите «Трансляцию» и выберите Twitch. В OBS выберите коллекцию **PS5**, введите ключ трансляции в Настройки → Трансляция и нажмите «Начать трансляцию», когда будете готовы.

Подробная установка по шагам: [docs/INSTALL.md](docs/INSTALL.md) (на английском). Установка с помощью ИИ: [docs/AI-INSTALL.md](docs/AI-INSTALL.md).

## Что внутри

- PS5 по-прежнему сама показывает чат и зрителей: берёт их прямо с Twitch.

- Установка без ручной работы: загрузки с проверкой контрольных сумм, автоопределение IP ПК, генерация конфигов.
- `doctor`: проверяет файлы, адреса, скорость DNS на ПК, подмену DNS, порт RTMP и активность PS5, и пишет, как исправить.
- Панель `http://127.0.0.1:8787` (на 5 языках): вещает ли PS5, состояние пересылки, кнопки перезапуска сервисов, адрес источника для OBS.
- Установщики в один клик для Windows и macOS. CI на каждое изменение ставит шлюз на чистые Windows и macOS, отправляет тестовый поток и проверяет, что он приходит на адрес, который читает OBS.
- На macOS скрипт файрвола не нужен: шлюз сам отвечает только PS5 и вашему Mac. Пока PS5 вещает, Mac не уходит в сон по бездействию.
- Автозапуск при входе в систему (задача планировщика в Windows, LaunchAgent в macOS).
- Генератор сцен OBS: одна сцена «PS5» с источником PS5, уже растянутым на весь экран; источник сам переподключается.

## Ограничения

- Проверено с настоящей PS5 на: Windows 10 и 11 (OBS 32) и MacBook с Apple silicon на macOS 27 (OBS 33.0.1). Остальное должно работать, но не проверялось; отчёты приветствуются.
- На macOS нужен OBS 33 или новее: OBS 32.2.2 на macOS 27 падает при запуске (см. [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#macos)).
- MacBook засыпает при закрытой крышке, и шлюз останавливается вместе с ним: во время стрима держите крышку открытой.
- OBS заново кодирует картинку, поэтому качество ограничено потоком самой PS5. Подсказки по настройкам: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
- Проект не связан с Sony, Twitch и другими упомянутыми компаниями. Он меняет только то, как ваша консоль находит ваш ПК в вашей сети.

## Лицензия

[PolyForm Noncommercial 1.0.0](LICENSE): бесплатно для личного и другого некоммерческого использования, для коммерческого нельзя. Это лицензия с открытым исходным кодом, но не «open source» в смысле OSI. Загружаемое стороннее ПО сохраняет свои лицензии, см. [NOTICE.md](NOTICE.md).
