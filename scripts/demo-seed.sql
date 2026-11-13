-- Fake data for local runs and `npm run verify`. Never touches production.
-- demo-1 has one photo; verify puts scripts/fixtures/demo-photo.png at its key in the local R2.
INSERT INTO submissions (id, created_at, status, kind, name, anonymous, consent_at, duration_s, photo_keys, transcript, tags) VALUES
 ('demo-1',datetime('now','-2 hours'),'new','audio','Marina Souza',0,datetime('now'),72,'["media/demo-1/photo-1"]','Saí de um banco pra uma startup e caí num sistema de pedidos com Kafka. Como você estudaria idempotência do zero?','["Dúvida","Carreira","Kafka"]'),
 ('demo-2',datetime('now','-1 day'),'favorite','audio',NULL,1,datetime('now'),88,'[]','Fui demitido semana passada junto com metade do time. Vale a pena tentar vaga fora agora ou espero o mercado?','["Dúvida","Carreira","Vida fora"]'),
 ('demo-3',datetime('now','-3 days'),'new','video','Rafael Lima',0,datetime('now'),54,'[]','Gravei aqui do escritório em Lisboa. Conta como foi sua primeira entrevista em inglês, travei total na minha.','["História","Entrevista","Vida fora"]');
