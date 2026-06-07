"use strict";
function identity(arg) {
    console.log(`Kiểu dữ liệu: ${typeof arg}, Giá trị: ${arg}`);
    return arg;
}
class StringBox {
    content;
    timestamp;
    constructor(content) {
        this.content = content;
        this.timestamp = new Date();
    }
    getInfo() {
        return `Box chứa chuỗi: "${this.content}" (thời gian: ${this.timestamp.toLocaleTimeString()})`;
    }
}
class NumberBox {
    content;
    timestamp;
    constructor(content) {
        this.content = content;
        this.timestamp = new Date();
    }
    getInfo() {
        return `Box chứa số: ${this.content} (thời gian: ${this.timestamp.toLocaleTimeString()})`;
    }
}
function createBox(content) {
    return {
        content: content,
        timestamp: new Date(),
        getInfo: function () {
            return `Box chứa: ${this.content}`;
        }
    };
}
console.log("=== HÀM GENERIC IDENTITY ===");
const stringResult = identity("Hello TypeScript");
const numberResult = identity(100);
const booleanResult = identity(true);
const arrayResult = identity([1, 2, 3, 4, 5]);
console.log("\n=== INTERFACE GENERIC BOX ===");
const stringBox = new StringBox("Sách TypeScript");
const numberBox = new NumberBox(42);
console.log(stringBox.getInfo());
console.log(numberBox.getInfo());
console.log("\n=== HÀM TẠO BOX GENERIC ===");
const box1 = createBox("Đây là chuỗi");
const box2 = createBox(999);
const box3 = createBox(false);
const box4 = createBox(["A", "B", "C"]);
console.log(box1.getInfo());
console.log(box2.getInfo());
console.log(box3.getInfo());
console.log(box4.getInfo());
console.log("\n=== MẢNG BOX VỚI NHIỀU KIỂU ===");
const boxes = [stringBox, numberBox, box1, box2];
boxes.forEach((box, index) => {
    console.log(`Box ${index + 1}: ${box.getInfo()}`);
});
