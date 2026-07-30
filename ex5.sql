CREATE TABLE Customers (
    CustomerID INT NOT NULL AUTO_INCREMENT,
    FullName VARCHAR(100) NOT NULL,
    Email VARCHAR(150),
    PRIMARY KEY (CustomerID)
);

CREATE TABLE Orders (
    OrderID INT NOT NULL AUTO_INCREMENT,
    OrderDate DATETIME,
    CustomerID INT,
    PRIMARY KEY (OrderID),
    FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
);

INSERT INTO Customers (FullName, Email) 
VALUES 
    ('Nguyen Van A', 'vana@gmail.com'),
    ('Tran Thi B', 'thib@gmail.com');

INSERT INTO Orders (OrderDate, CustomerID) 
VALUES 
    ('2026-07-28 10:30:00', 1),
    ('2026-07-29 14:15:00', 1),
    ('2026-07-30 09:00:00', 2);

SELECT 
    o.OrderID AS 'Mã đơn hàng', 
    o.OrderDate AS 'Ngày đặt hàng', 
    c.FullName AS 'Tên khách hàng'
FROM Orders o
INNER JOIN Customers c ON o.CustomerID = c.CustomerID;