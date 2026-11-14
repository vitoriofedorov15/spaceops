# API

REST-префикс: `/api/v1`. Интерактивная OpenAPI-документация: `/api/docs`, JSON: `/api/docs-json`.

## Сессия и CSRF

`POST /auth/login` принимает `{ "email": "anna@spaceops.demo", "password": "…" }` и выставляет `spaceops_session` (HttpOnly) и `spaceops_csrf`. Все мутации, включая login, требуют `Origin`, равный `PUBLIC_URL`. После login добавляйте `X-CSRF-Token` со значением cookie `spaceops_csrf`. Браузерный клиент делает это автоматически. Swagger работает на том же домене: после входа токен можно указать в Authorize / csrf.

`GET /auth/me` возвращает текущего пользователя; `POST /auth/logout` удаляет сессию.

## Основные маршруты

Все пути ниже идут после `/api/v1`.

| Группа       | Методы и пути                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Площадка     | GET /site, GET /floors, GET /floors/:id/plan                                                                                                                                     |
| Пространства | GET /spaces, GET /spaces/:id, POST /spaces, PATCH /spaces/:id                                                                                                                    |
| Встречи      | GET /bookings, POST /bookings, PATCH /bookings/:id, POST /bookings/:id/cancel, GET /bookings/:id/history                                                                         |
| Ограничения  | GET /blocks, POST /spaces/:id/blocks, POST /blocks/:id/release, GET /blocks/:id/affected-bookings                                                                                |
| Переносы     | GET /bookings/:id/alternatives, POST /bookings/:id/relocation-proposals, GET /relocation-proposals, POST /relocation-proposals/:id/accept, POST /relocation-proposals/:id/reject |
| Оборудование | GET /equipment, POST /equipment, PATCH /equipment/:id                                                                                                                            |
| Обращения    | GET /tickets, GET /tickets/:id, POST /tickets, PATCH /tickets/:id, POST /tickets/:id/comments                                                                                    |
| Пользователи | GET /users, PATCH /users/:id/role                                                                                                                                                |
| Уведомления  | GET /notifications, POST /notifications/:id/read, POST /notifications/read-all                                                                                                   |
| Аналитика    | GET /analytics/overview                                                                                                                                                          |
| Диагностика  | GET /health                                                                                                                                                                      |

Списки принимают `page` от 1 и `limit` от 1 до 100, по умолчанию 50. Они возвращают массив текущей страницы; уведомления возвращают `{unread, items}`. План возвращает `{floor, spaces}`. Следующую страницу запрашивайте до массива короче limit. Короткие фиксированные справочники этажей не пагинируются.

Периоды задаются `from`, `to` в ISO 8601 с offset; максимум 93 дня. По умолчанию — текущий момент и следующие 7 дней. Пространства и план считают занятость на весь выбранный интервал. Время начала/конца встречи должно совпадать с четвертью часа в часовом поясе площадки.

Фильтры:

- spaces: `floor_id`, `type=room|desk`, `capacity`, `equipment` (категория), `search`, `include_archived=true` (только управляющим ролям);
- bookings: `mine=true`, `status=active|cancelled`, `space_id`, `needs_relocation=true`;
- equipment: `search`, `state`, `space_id`, `category`;
- tickets: `status`, `space_id`.

## Форматы мутаций

Бронирование:

```json
{
  "space_id": "UUID",
  "title": "Планирование спринта",
  "starts_at": "2030-07-10T10:00:00+02:00",
  "ends_at": "2030-07-10T11:00:00+02:00",
  "attendees": 4,
  "requirements": ["projector"],
  "comment": "Обсудим цели недели"
}
```

PATCH бронирования принимает все эти поля и `version`. Отмена принимает `{ "version": 1 }`. Предложение переноса — `{ "space_id": "UUID целевого помещения", "version": 2 }`. Принятие и отказ не требуют тела; версия уже записана в предложении.

Ограничение: `{ "starts_at": "ISO", "ends_at": "ISO", "reason": "Диагностика проектора" }`.

Обращение: `{ "space_id": "UUID", "equipment_id": "UUID (необязательно)", "title": "Не работает проектор", "description": "Подробности", "category": "equipment", "priority": "high" }`. Категории: equipment / climate / cleaning / other; приоритеты: low / normal / high.

PATCH обращения принимает `status`, `assignee_id` (UUID либо null), `comment`. Назначаемый исполнитель должен быть диспетчером/администратором. Статусы: new → in_progress → resolved → closed; closed → in_progress требует comment. Комментарий отдельным запросом: `{ "body": "Текст" }`.

Оборудование: `{ "space_id": "UUID", "name": "Проектор", "inventory_number": "SP-9999", "category": "projector", "state": "working" }`. PATCH позволяет менять name, inventory_number, category, state. Состояния: working / broken / repair.

PATCH пространства: необязательные `name`, `capacity`, `archived`. Создание пространства дополнительно принимает floor_id, type и geometry `{x,y,width,height}` внутри SVG 1000×620. Редактор плана не входит в UI первой версии.

## Ошибки

```json
{
  "code": "SPACE_UNAVAILABLE",
  "message": "Помещение занято или заблокировано на выбранное время",
  "details": null
}
```

400 — входные данные или бизнес-ограничение, 401 — сессия/вход, 403 — роль/владелец/CSRF/Origin, 404 — отсутствующий объект, 409 — конфликт времени или версии, 429 — лимит входа. При 409 обновите доступность и версию записи; клиент сохраняет заполненную форму.
