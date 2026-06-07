"use strict";
class Shape {
    name;
    constructor(name) {
        this.name = name;
    }
    calculateArea() {
        return 0;
    }
    display() {
        console.log(`Hình: ${this.name}, Diện tích: ${this.calculateArea()}`);
    }
}
class Circle extends Shape {
    radius;
    constructor(radius) {
        super("Hình tròn");
        this.radius = radius;
    }
    calculateArea() {
        return Math.PI * this.radius * this.radius;
    }
}
class Rectangle extends Shape {
    width;
    height;
    constructor(width, height) {
        super("Hình chữ nhật");
        this.width = width;
        this.height = height;
    }
    calculateArea() {
        return this.width * this.height;
    }
}
const circle = new Circle(5);
const rectangle = new Rectangle(4, 6);
circle.display();
rectangle.display();
console.log(`Diện tích hình tròn: ${circle.calculateArea().toFixed(2)}`);
console.log(`Diện tích hình chữ nhật: ${rectangle.calculateArea()}`);
const shapes = [circle, rectangle];
console.log("=== Đa hình ===");
shapes.forEach(shape => {
    console.log(`${shape.name} có diện tích: ${shape.calculateArea().toFixed(2)}`);
});
