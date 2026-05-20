// for(var i = 2; i<=9; i++){
//     console.log("bảng nhân " + i);
//     for(var j = 1; j<=9; j++){
//         console.log(i + " x " + j + " = " + (i*j));
//     }
// }

/*

viết code  cho phép nhập vào 2 cạnh của 1 hình chữ nhật, tính chu vi, phải validate

dữ liệu nhập vào phải là số, nếu không phải số thì yêu cầu nhập lại, nếu là số thì tính chu vi và in
ra màn hình và dài >= rộng
*/
var rong = prompt("Nhập vào chiều rộng của hình chữ nhật");
var dai = prompt("Nhập vào chiều dài của hình chữ nhật");
while(isNaN(width) || isNaN(length) || width <= 0 || length <= 0 || length < width){
    alert("Dữ liệu nhập vào không hợp lệ, vui lòng nhập lại");
    rong = prompt("Nhập vào chiều rộng của hình chữ nhật");
    dai = prompt("Nhập vào chiều dài của hình chữ nhật");
}
var chuVi = 2 * (parseFloat(rong) + parseFloat(dai));
console.log("Chu vi của hình chữ nhật là: " + chuVi);