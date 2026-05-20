let luong = parseFloat(prompt("Nhập số tiền lương (triệu đồng):"));
let tuoi = parseInt(prompt("Nhập độ tuổi:"));
let noXau = prompt("Có nợ xấu không? (Yes/No):").toLowerCase();

let duocVay = (luong > 15) && (tuoi >= 18 && tuoi <= 60) && (noXau === "no");

if (duocVay) {
    alert("Chúc mừng! Bạn ĐƯỢC vay vốn.");
    console.log("Kết quả: ĐƯỢC vay vốn");
} else {
    alert("Rất tiếc! Bạn KHÔNG được vay vốn.");
    console.log("Kết quả: KHÔNG được vay vốn");
}