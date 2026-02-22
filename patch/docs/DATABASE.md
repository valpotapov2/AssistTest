# База данных — API Test System

## Применить миграцию

```bash
mysql -u user -p db_name < database/migrations/001_api_test_initial.sql
```

## Таблицы

| Таблица | Описание |
|---|---|
| `api_test_suite` | Наборы тестов |
| `api_test_case` | Тест-кейсы |
| `api_test_run` | Запуски |
| `api_test_result` | Результаты шагов |

## SQL-шаблоны (101–112)

Регистрируются в `sql_template`, используются через `/query/template/{id}`.

## Соглашения

- `snake_case`, `id_entity`, `create_datetime/create_user`
- Переменные в SQL: `{{var}}`, в URL/params: `<var>`
