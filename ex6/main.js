let w,h;

do{
    w = parseFloat(prompt("Nhập chiều rộng (w):"));
    h = parseFloat(prompt("Nhập chiều cao (h):"));
    if(w <= 0 || h <= 0){
        alert("Chiều rộng và chiều cao phải lớn hơn 0. Vui lòng nhập lại.");
    }
}while(w <= 0 || h <= 0);

for (let i = 0; i < h; i++){
    let row = "";
    for (let j = 0; j < w; j++){
        row += "* ";
    }
    console.log(row);
}