let secretNumber = Math.floor(Math.random() * 100) + 1;
let maxGuesses = 5;
let guessedCorrectly = false;

for (let i = 1; i <= maxGuesses; i++) {
    let guess = parseInt(prompt("Lần đoán thứ " + i + "/" + maxGuesses + "\nNhập số từ 1 đến 100:"));

    if (isNaN(guess) || guess < 1 || guess > 100) {
        alert("Vui lòng nhập số từ 1 đến 100!");
        i--;
        continue;
    }

    if (guess === secretNumber) {
        alert("Chúc mừng! Bạn đã đoán đúng số " + secretNumber + " ở lần thứ " + i);
        console.log("Chúc mừng! Đoán đúng số " + secretNumber + " ở lần thứ " + i);
        guessedCorrectly = true;
        break;
    } else if (guess > secretNumber) {
        alert("Số bạn đoán quá lớn! Còn " + (maxGuesses - i) + " lần đoán");
    } else {
        alert("Số bạn đoán quá nhỏ! Còn " + (maxGuesses - i) + " lần đoán");
    }
}

if (!guessedCorrectly) {
    alert("Game Over! Số bí mật là " + secretNumber);
    console.log("Game Over! Số bí mật là " + secretNumber);
}