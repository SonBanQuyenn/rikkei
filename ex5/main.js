let number;

do {
    number = parseInt(prompt("Nhập một số từ 1 đến 10:"));
    
    if (number < 1 || number > 10) {
        alert("Số không hợp lệ! Vui lòng nhập số từ 1 đến 10.");
    }
} while (number < 1 || number > 10);

alert("Số hợp lệ! Bạn đã nhập: " + number);
console.log("Số hợp lệ:", number);