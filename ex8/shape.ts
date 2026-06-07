class Shape {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    calculateArea(): number {
        return 0;
    }

    display(): void {
        console.log(`Hình: ${this.name}, Diện tích: ${this.calculateArea()}`);
    }
}

class Circle extends Shape {
    radius: number;

    constructor(radius: number) {
        super("Hình tròn");
        this.radius = radius;
    }

    calculateArea(): number {
        return Math.PI * this.radius * this.radius;
    }
}

class Rectangle extends Shape {
    width: number;
    height: number;

    constructor(width: number, height: number) {
        super("Hình chữ nhật");
        this.width = width;
        this.height = height;
    }

    calculateArea(): number {
        return this.width * this.height;
    }
}

const circle = new Circle(5);
const rectangle = new Rectangle(4, 6);

circle.display();
rectangle.display();

console.log(`Diện tích hình tròn: ${circle.calculateArea().toFixed(2)}`);
console.log(`Diện tích hình chữ nhật: ${rectangle.calculateArea()}`);

const shapes: Shape[] = [circle, rectangle];
console.log("=== Đa hình ===");
shapes.forEach(shape => {
    console.log(`${shape.name} có diện tích: ${shape.calculateArea().toFixed(2)}`);
});