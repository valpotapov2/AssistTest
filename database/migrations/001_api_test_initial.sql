-- ============================================================
-- API Test System — Migration v1.0
-- Конвенции платформы: snake_case, id_entity, create_datetime/create_user
-- ============================================================

-- 1. Наборы тестов
CREATE TABLE IF NOT EXISTS `api_test_suite` (
  `id_api_test_suite`   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`                VARCHAR(255)  NOT NULL DEFAULT '',
  `description`         TEXT,
  `domain`              VARCHAR(64)   NOT NULL DEFAULT 'medical',
  `base_url`            VARCHAR(512)  NOT NULL DEFAULT '',
  `sort`                INT UNSIGNED  NOT NULL DEFAULT 0,
  `active`              TINYINT(1)    NOT NULL DEFAULT 1,
  `create_datetime`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_user`         INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_api_test_suite`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Тест-кейсы
CREATE TABLE IF NOT EXISTS `api_test_case` (
  `id_api_test_case`    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_api_test_suite`   INT UNSIGNED  NOT NULL DEFAULT 0,
  `name`                VARCHAR(255)  NOT NULL DEFAULT '',
  `description`         TEXT,
  `sort`                INT UNSIGNED  NOT NULL DEFAULT 0,
  `method`              VARCHAR(8)    NOT NULL DEFAULT 'POST',
  `url`                 VARCHAR(512)  NOT NULL DEFAULT '',
  `params`              TEXT          COMMENT 'JSON объект с параметрами, поддерживает <var>',
  `u_a_role`            TINYINT       NOT NULL DEFAULT 0,
  `depends_on`          INT UNSIGNED  NOT NULL DEFAULT 0,
  `chain_group`         VARCHAR(64)   NOT NULL DEFAULT '',
  `state_save`          TEXT          COMMENT 'JSON: {"state_key":"response.data.field"}',
  `validations`         TEXT          COMMENT 'JSON: [{"type":"eq","field":"code","value":"200"}]',
  `snapshot_config`     TEXT          COMMENT 'JSON: [{"label":"...","method":"GET","url":"..."}]',
  `tags`                VARCHAR(255)  NOT NULL DEFAULT '',
  `active`              TINYINT(1)    NOT NULL DEFAULT 1,
  `create_datetime`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_user`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `update_datetime`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_api_test_case`),
  KEY `idx_suite` (`id_api_test_suite`),
  KEY `idx_chain` (`chain_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Запуски
CREATE TABLE IF NOT EXISTS `api_test_run` (
  `id_api_test_run`     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_api_test_suite`   INT UNSIGNED  NOT NULL DEFAULT 0,
  `mode`                VARCHAR(16)   NOT NULL DEFAULT 'auto',
  `status`              VARCHAR(16)   NOT NULL DEFAULT 'running',
  `total_cases`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `passed_cases`        INT UNSIGNED  NOT NULL DEFAULT 0,
  `failed_cases`        INT UNSIGNED  NOT NULL DEFAULT 0,
  `duration_ms`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `create_datetime`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_user`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `finish_datetime`     DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id_api_test_run`),
  KEY `idx_suite` (`id_api_test_suite`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Результаты шагов
CREATE TABLE IF NOT EXISTS `api_test_result` (
  `id_api_test_result`  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_api_test_run`     INT UNSIGNED  NOT NULL DEFAULT 0,
  `id_api_test_case`    INT UNSIGNED  NOT NULL DEFAULT 0,
  `status`              VARCHAR(16)   NOT NULL DEFAULT 'pending',
  `http_status`         SMALLINT      NOT NULL DEFAULT 0,
  `request_url`         VARCHAR(512)  NOT NULL DEFAULT '',
  `request_body`        TEXT,
  `response_body`       TEXT,
  `validation_results`  TEXT,
  `snapshot_after`      TEXT,
  `state_after`         TEXT,
  `duration_ms`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `error_message`       VARCHAR(1024) NOT NULL DEFAULT '',
  `create_datetime`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_api_test_result`),
  KEY `idx_run` (`id_api_test_run`),
  KEY `idx_case` (`id_api_test_case`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SQL-шаблоны (регистрация в sql_template для /query/template/{id})
-- value хранится как JSON: {"code":"SQL..."}
-- Переменные в SQL используют синтаксис {{var}} — заменяются через data=JSON
-- ============================================================

INSERT INTO `sql_template`
  (`id_sql_template`, `name_1`, `name_2`, `value`, `only_admin`, `active`)
VALUES

(101, 'api_test: get_suites', 'api_test: get_suites',
  '{"code":"SELECT `id_api_test_suite` as id, `name`, `description`, `domain`, `base_url`, `sort`, `active` FROM `api_test_suite` ORDER BY `sort` ASC, `id_api_test_suite` ASC"}',
  1, 1),

(102, 'api_test: get_cases', 'api_test: get_cases',
  '{"code":"SELECT `id_api_test_case` as id, `id_api_test_suite`, `name`, `description`, `sort`, `method`, `url`, `params`, `u_a_role`, `depends_on`, `chain_group`, `state_save`, `validations`, `snapshot_config`, `tags`, `active` FROM `api_test_case` WHERE `id_api_test_suite` = {{suite_id}} ORDER BY `sort` ASC, `id_api_test_case` ASC"}',
  1, 1),

(103, 'api_test: get_case', 'api_test: get_case',
  '{"code":"SELECT `id_api_test_case` as id, `id_api_test_suite`, `name`, `description`, `sort`, `method`, `url`, `params`, `u_a_role`, `depends_on`, `chain_group`, `state_save`, `validations`, `snapshot_config`, `tags`, `active` FROM `api_test_case` WHERE `id_api_test_case` = {{case_id}} LIMIT 1"}',
  1, 1),

(104, 'api_test: save_case', 'api_test: save_case',
  '{"code":"INSERT INTO `api_test_case` (`id_api_test_case`,`id_api_test_suite`,`name`,`description`,`sort`,`method`,`url`,`params`,`u_a_role`,`depends_on`,`chain_group`,`state_save`,`validations`,`snapshot_config`,`tags`,`active`,`create_user`) VALUES ({{case_id}},{{suite_id}},{{name}},{{description}},{{sort}},{{method}},{{url}},{{params}},{{u_a_role}},{{depends_on}},{{chain_group}},{{state_save}},{{validations}},{{snapshot_config}},{{tags}},{{active}},{{user_id}}) ON DUPLICATE KEY UPDATE `name`={{name}},`description`={{description}},`sort`={{sort}},`method`={{method}},`url`={{url}},`params`={{params}},`u_a_role`={{u_a_role}},`depends_on`={{depends_on}},`chain_group`={{chain_group}},`state_save`={{state_save}},`validations`={{validations}},`snapshot_config`={{snapshot_config}},`tags`={{tags}},`active`={{active}},`update_datetime`=NOW()"}',
  1, 1),

(105, 'api_test: delete_case', 'api_test: delete_case',
  '{"code":"DELETE FROM `api_test_case` WHERE `id_api_test_case` = {{case_id}} LIMIT 1"}',
  1, 1),

(106, 'api_test: save_suite', 'api_test: save_suite',
  '{"code":"INSERT INTO `api_test_suite` (`id_api_test_suite`,`name`,`description`,`domain`,`base_url`,`sort`,`active`,`create_user`) VALUES ({{suite_id}},{{name}},{{description}},{{domain}},{{base_url}},{{sort}},{{active}},{{user_id}}) ON DUPLICATE KEY UPDATE `name`={{name}},`description`={{description}},`domain`={{domain}},`base_url`={{base_url}},`sort`={{sort}},`active`={{active}}"}',
  1, 1),

(107, 'api_test: start_run', 'api_test: start_run',
  '{"code":"INSERT INTO `api_test_run` (`id_api_test_suite`,`mode`,`status`,`total_cases`,`create_user`) VALUES ({{suite_id}},{{mode}},\"running\",{{total_cases}},{{user_id}})"}',
  1, 1),

(108, 'api_test: finish_run', 'api_test: finish_run',
  '{"code":"UPDATE `api_test_run` SET `status`={{status}},`passed_cases`={{passed}},`failed_cases`={{failed}},`duration_ms`={{duration_ms}},`finish_datetime`=NOW() WHERE `id_api_test_run`={{run_id}} LIMIT 1"}',
  1, 1),

(109, 'api_test: save_result', 'api_test: save_result',
  '{"code":"INSERT INTO `api_test_result` (`id_api_test_run`,`id_api_test_case`,`status`,`http_status`,`request_url`,`request_body`,`response_body`,`validation_results`,`snapshot_after`,`state_after`,`duration_ms`,`error_message`) VALUES ({{run_id}},{{case_id}},{{status}},{{http_status}},{{request_url}},{{request_body}},{{response_body}},{{validation_results}},{{snapshot_after}},{{state_after}},{{duration_ms}},{{error_message}})"}',
  1, 1),

(110, 'api_test: get_runs', 'api_test: get_runs',
  '{"code":"SELECT `id_api_test_run` as id, `id_api_test_suite`, `mode`, `status`, `total_cases`, `passed_cases`, `failed_cases`, `duration_ms`, `create_datetime`, `finish_datetime` FROM `api_test_run` WHERE `id_api_test_suite` = {{suite_id}} ORDER BY `id_api_test_run` DESC LIMIT 20"}',
  1, 1),

(111, 'api_test: get_run_results', 'api_test: get_run_results',
  '{"code":"SELECT r.`id_api_test_result` as id, r.`id_api_test_case`, c.`name` as case_name, c.`url`, r.`status`, r.`http_status`, r.`request_url`, r.`request_body`, r.`response_body`, r.`validation_results`, r.`snapshot_after`, r.`state_after`, r.`duration_ms`, r.`error_message` FROM `api_test_result` r LEFT JOIN `api_test_case` c USING(`id_api_test_case`) WHERE r.`id_api_test_run` = {{run_id}} ORDER BY r.`id_api_test_result` ASC"}',
  1, 1),

(112, 'api_test: reorder_case', 'api_test: reorder_case',
  '{"code":"UPDATE `api_test_case` SET `sort`={{sort}} WHERE `id_api_test_case`={{case_id}} LIMIT 1"}',
  1, 1)

ON DUPLICATE KEY UPDATE
  `name_1` = VALUES(`name_1`),
  `value`  = VALUES(`value`),
  `active` = VALUES(`active`);

-- ============================================================
-- Предзаполненные кейсы — Медицинский домен
-- ============================================================

INSERT INTO `api_test_suite`
  (`id_api_test_suite`,`name`,`description`,`domain`,`base_url`,`sort`,`active`)
VALUES
  (1,'Медицина: полный флоу врача',
   'Авторизация → Пациент → Первичный приём → Фото → Завершение → Осмотр → Повторный приём',
   'medical','https://geoblinker.ru/taxi/c/Assist/api/v1',1,1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

INSERT INTO `api_test_case`
  (`id_api_test_case`,`id_api_test_suite`,`name`,`sort`,`method`,`url`,
   `params`,`u_a_role`,`depends_on`,`chain_group`,
   `state_save`,`validations`,`snapshot_config`,`tags`)
VALUES

-- AUTH
(1,1,'Авторизация: шаг 1 — auth_hash',10,'POST','/auth/',
 '{"login":"<cfg_login>","type":"e-mail","password":"<cfg_password>"}',
 0,0,'auth',
 '{"auth_hash":"auth_hash"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"auth_hash"}]',
 NULL,'auth,chain'),

(2,1,'Авторизация: шаг 2 — token',20,'POST','/token',
 '{"auth_hash":"<auth_hash>"}',
 0,1,'auth',
 '{"token":"data.token","u_hash":"data.u_hash","u_id":"data.u_id"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.token"}]',
 NULL,'auth,chain'),

(3,1,'Конфигурация приложения',30,'GET','/data/',
 '{}',0,2,'config',
 '{}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data"}]',
 NULL,'chain'),

-- PATIENT
(4,1,'Картотека: список пациентов',40,'GET','/drive/archive',
 '{"type":"patient","lo":"0","lc":"10"}',
 0,2,'patient',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain'),

(5,1,'Создание пациента',50,'POST','/contact/create',
 '{"data":"{\"co_name\":\"Тестовый Пациент Авто\",\"co_phone\":\"+70000000001\",\"co_email\":\"autotest@test.ru\"}"}',
 0,2,'patient',
 '{"co_id":"data.co_id"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.co_id"}]',
 '[{"label":"Пациент","method":"GET","url":"/drive/archive","params":{"patient_id":"<co_id>"}}]',
 'chain'),

(6,1,'Поиск пациента по телефону',60,'GET','/drive/archive',
 '{"type":"patient","phone":"+70000000001"}',
 0,5,'patient',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain'),

-- PRIMARY
(7,1,'Создание первичного приёма',70,'POST','/drive',
 '{"data":"{\"patient_id\":\"<co_id>\",\"type\":\"primary\",\"procedure_type\":\"bta\"}"}',
 2,5,'primary',
 '{"b_id":"data.b_id"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.b_id"}]',
 '[{"label":"Приём","method":"GET","url":"/drive/get/<b_id>"}]',
 'chain,auth'),

(8,1,'Детали приёма',80,'GET','/drive/get/<b_id>',
 '{}',2,7,'primary',
 '{}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.b_id"}]',
 '[{"label":"Приём","method":"GET","url":"/drive/get/<b_id>"}]',
 'chain,auth'),

(9,1,'Прикрепить пациента (set_performer)',90,'POST','/drive/get/<b_id>',
 '{"action":"set_performer","u_id":"<co_id>"}',
 2,7,'primary',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 '[{"label":"Приём","method":"GET","url":"/drive/get/<b_id>"}]',
 'chain,auth'),

-- STORAGE
(10,1,'Фото: presigned URL',100,'POST','/storage/presign',
 '{"visit_id":"<b_id>","filename":"lob_static.jpg","content_type":"image/jpeg","zone":"лоб","photo_type":"static","purpose":"primary"}',
 0,9,'photos',
 '{"presigned_url":"data.presigned_url","s3_key":"data.s3_key"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.presigned_url"},{"type":"hasField","field":"data.s3_key"}]',
 NULL,'chain,auth'),

(11,1,'Фото: привязать к приёму',110,'POST','/drive/get/<b_id>',
 '{"action":"edit","photo_ids":"[\"<s3_key>\"]"}',
 2,10,'photos',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 '[{"label":"Приём с фото","method":"GET","url":"/drive/get/<b_id>"}]',
 'chain,auth'),

-- COMPLETE PRIMARY
(12,1,'Завершение первичного приёма',120,'POST','/drive/get/<b_id>',
 '{"action":"complete","data":"{\"zones_data\":[{\"zone\":\"лоб\",\"schema\":\"soft\",\"dose\":5}],\"schedule_followup\":true,\"followup_interval_days\":14,\"patient_notification\":{\"send\":false}}"}',
 2,11,'primary',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 '[{"label":"Завершённый приём","method":"GET","url":"/drive/get/<b_id>"},{"label":"Карточка пациента","method":"GET","url":"/drive/archive","params":{"patient_id":"<co_id>"}}]',
 'chain,auth'),

-- FOLLOWUP
(13,1,'Запланированные осмотры',130,'GET','/drive',
 '{"type":"followup","status":"scheduled"}',
 2,12,'followup',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain,auth'),

(14,1,'Создание осмотра (followup)',140,'POST','/drive',
 '{"data":"{\"patient_id\":\"<co_id>\",\"type\":\"followup\",\"parent_visit_id\":\"<b_id>\"}"}',
 2,12,'followup',
 '{"b_id_followup":"data.b_id"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.b_id"}]',
 '[{"label":"Осмотр","method":"GET","url":"/drive/get/<b_id_followup>"}]',
 'chain,auth'),

(15,1,'Данные предыдущего приёма для сравнения',150,'GET','/drive/get/<b_id>',
 '{}',2,14,'followup',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain,auth'),

(16,1,'Завершение осмотра (complete_followup)',160,'POST','/drive/get/<b_id_followup>',
 '{"action":"complete_followup","data":"{\"results\":{\"лоб\":\"ok\",\"межбровье\":\"needs_correction\"},\"send_collage_to_patient\":false,\"schedule_repeat\":true,\"repeat_interval_months\":6}"}',
 2,14,'followup',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 '[{"label":"Завершённый осмотр","method":"GET","url":"/drive/get/<b_id_followup>"}]',
 'chain,auth'),

-- REPEAT
(17,1,'Запланированные повторные приёмы',170,'GET','/drive',
 '{"type":"repeat","status":"scheduled"}',
 2,16,'repeat',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain,auth'),

(18,1,'Создание повторного приёма',180,'POST','/drive',
 '{"data":"{\"patient_id\":\"<co_id>\",\"type\":\"repeat\",\"parent_visit_id\":\"<b_id_followup>\"}"}',
 2,16,'repeat',
 '{"b_id_repeat":"data.b_id"}',
 '[{"type":"eq","field":"code","value":"200"},{"type":"hasField","field":"data.b_id"}]',
 '[{"label":"Повторный приём","method":"GET","url":"/drive/get/<b_id_repeat>"}]',
 'chain,auth'),

-- NOTIFICATIONS
(19,1,'Список уведомлений',190,'GET','/drive',
 '{"type":"notifications"}',
 2,2,'notifications',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'auth'),

(20,1,'Отправка напоминания пациенту',200,'POST','/contact/message/send',
 '{"data":"{\"batch\":[{\"patient_id\":\"<co_id>\",\"template_type\":\"reminder_followup\"}]}"}',
 0,14,'notifications',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 NULL,'chain,auth'),

-- NEGATIVE
(21,1,'Негативный: неверный пароль',210,'POST','/auth/',
 '{"login":"<cfg_login>","type":"e-mail","password":"WRONG_PASSWORD_xyz999"}',
 0,0,'',
 '{}',
 '[{"type":"eq","field":"code","value":"404"}]',
 NULL,'negative'),

(22,1,'Негативный: запрос без токена',220,'POST','/drive',
 '{"token":"invalid_token","u_hash":"invalid_hash","u_a_role":"2","data":"{\"patient_id\":\"1\",\"type\":\"primary\"}"}',
 0,0,'',
 '{}',
 '[{"type":"eq","field":"code","value":"404"}]',
 NULL,'negative'),

(23,1,'Негативный: несуществующий приём',230,'POST','/drive/get/99999999',
 '{"action":"set_cancel_state","reason":"test negative"}',
 2,2,'',
 '{}',
 '[{"type":"eq","field":"code","value":"404"}]',
 NULL,'negative'),

-- CLEANUP
(24,1,'Cleanup: отмена тестового приёма',240,'POST','/drive/get/<b_id>',
 '{"action":"set_cancel_state","reason":"autotest cleanup","notify_patient":"false"}',
 2,12,'cleanup',
 '{}',
 '[{"type":"eq","field":"code","value":"200"}]',
 '[{"label":"Отменённый приём","method":"GET","url":"/drive/get/<b_id>"}]',
 'chain,auth')

ON DUPLICATE KEY UPDATE
  `name`            = VALUES(`name`),
  `params`          = VALUES(`params`),
  `validations`     = VALUES(`validations`),
  `snapshot_config` = VALUES(`snapshot_config`),
  `tags`            = VALUES(`tags`);
