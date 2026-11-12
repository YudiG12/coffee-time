-- Fake data for local runs and `npm run verify`. Never touches production.
INSERT INTO submissions (id, status, kind, name, anonymous, consent_at, duration_s, transcript, tags) VALUES
 ('demo-1','new','audio','Marina Souza',0,datetime('now'),72,'Saí de um banco pra uma startup e caí num sistema de pedidos com Kafka. Como você estudaria idempotência do zero?','["Dúvida","Carreira","Kafka"]'),
 ('demo-2','favorite','audio',NULL,1,datetime('now'),88,'Fui demitido semana passada junto com metade do time. Vale a pena tentar vaga fora agora ou espero o mercado?','["Dúvida","Carreira","Vida fora"]'),
 ('demo-3','new','video','Rafael Lima',0,datetime('now'),54,'Gravei aqui do escritório em Lisboa. Conta como foi sua primeira entrevista em inglês, travei total na minha.','["História","Entrevista","Vida fora"]');
