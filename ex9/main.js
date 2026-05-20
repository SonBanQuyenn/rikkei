let n = parseInt(prompt("Nhập một số nguyên:"));

let flag = true;

if (n < 2) {
    flag = false;
} else {
    for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) {
            flag = false;
            break;
        }
    }
}

if (flag) {
    alert(n + " là số nguyên tố");
    console.log(n + " là số nguyên tố");
} else {
    alert(n + " không phải số nguyên tố");
    console.log(n + " không phải số nguyên tố");
}