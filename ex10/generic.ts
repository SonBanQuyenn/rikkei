function identity<T>(arg: T): T {
    console.log(`Kiểu dữ liệu: ${typeof arg}, Giá trị: ${arg}`);
    return arg;
}

interface Box<T> {
    content: T;
    timestamp: Date;
    getInfo(): string;
}

class StringBox implements Box<string> {
    content: string;
    timestamp: Date;

    constructor(content: string) {
        this.content = content;
        this.timestamp = new Date();
    }

    getInfo(): string {
        return `Box chứa chuỗi: "${this.content}" (thời gian: ${this.timestamp.toLocaleTimeString()})`;
    }
}

class NumberBox implements Box<number> {
    content: number;
    timestamp: Date;

    constructor(content: number) {
        this.content = content;
        this.timestamp = new Date();
    }

    getInfo(): string {
        return `Box chứa số: ${this.content} (thời gian: ${this.timestamp.toLocaleTimeString()})`;
    }
}

function createBox<T>(content: T): Box<T> {
    return {
        content: content,
        timestamp: new Date(),
        getInfo: function() {
            return `Box chứa: ${this.content}`;
        }
    };
}

console.log("=== HÀM GENERIC IDENTITY ===");
const stringResult = identity<string>("Hello TypeScript");
const numberResult = identity<number>(100);
const booleanResult = identity<boolean>(true);
const arrayResult = identity<number[]>([1, 2, 3, 4, 5]);

console.log("\n=== INTERFACE GENERIC BOX ===");
const stringBox = new StringBox("Sách TypeScript");
const numberBox = new NumberBox(42);

console.log(stringBox.getInfo());
console.log(numberBox.getInfo());

console.log("\n=== HÀM TẠO BOX GENERIC ===");
const box1 = createBox<string>("Đây là chuỗi");
const box2 = createBox<number>(999);
const box3 = createBox<boolean>(false);
const box4 = createBox<string[]>(["A", "B", "C"]);

console.log(box1.getInfo());
console.log(box2.getInfo());
console.log(box3.getInfo());
console.log(box4.getInfo());

console.log("\n=== MẢNG BOX VỚI NHIỀU KIỂU ===");
const boxes: Box<any>[] = [stringBox, numberBox, box1, box2];
boxes.forEach((box, index) => {
    console.log(`Box ${index + 1}: ${box.getInfo()}`);
});