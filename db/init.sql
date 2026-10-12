CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  species VARCHAR(40) NOT NULL,
  breed VARCHAR(80),
  age NUMERIC(4,1) CHECK (age >= 0),
  price NUMERIC(12,0) CHECK (price >= 0),
  status VARCHAR(20) DEFAULT 'Còn hàng' CHECK (status IN ('Còn hàng','Đã bán','Đặt trước')),
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price NUMERIC(12,0) NOT NULL CHECK (price >= 0),
  duration_min INT DEFAULT 60 CHECK (duration_min > 0)
);
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  pet_id INT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
  service_id INT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  appt_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'Chờ' CHECK (status IN ('Chờ','Đang làm','Hoàn thành','Đã hủy')),
  note TEXT
);
INSERT INTO customers (full_name, phone, email, address) VALUES
 ('Nguyễn Văn An','0901234567','an@example.com','Thái Nguyên'),
 ('Trần Thị Bình','0912345678','binh@example.com','Hà Nội'),
 ('Lê Minh Cường','0987654321','cuong@example.com','Bắc Ninh');
INSERT INTO pets (name, species, breed, age, price, status, customer_id) VALUES
 ('Mực','Chó','Poodle',1.5,4500000,'Đã bán',1),
 ('Tuyết','Mèo','Anh lông ngắn',0.8,6000000,'Đã bán',2),
 ('Lu','Chó','Corgi',0.5,12000000,'Còn hàng',NULL),
 ('Mimi','Mèo','Ba Tư',1.0,5000000,'Còn hàng',NULL);
INSERT INTO services (name, description, price, duration_min) VALUES
 ('Tắm spa cơ bản','Tắm, sấy, vệ sinh tai',150000,45),
 ('Cắt tỉa lông tạo kiểu','Cắt tỉa theo giống',250000,90),
 ('Spa thư giãn cao cấp','Tắm thảo dược, massage, cắt móng',400000,120);
INSERT INTO appointments (customer_id, pet_id, service_id, appt_time, status, note) VALUES
 (1,1,1, now() + interval '1 day','Chờ','Chó hay sợ máy sấy'),
 (2,2,3, now() + interval '2 day','Chờ',NULL);
