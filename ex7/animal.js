"use strict";
class Animal {
    name;
    constructor(name) {
        this.name = name;
    }
    makeSound() {
        console.log(`${this.name} đang kêu...`);
    }
}
class Dog extends Animal {
    breed;
    constructor(name, breed) {
        super(name);
        this.breed = breed;
    }
    makeSound() {
        console.log(`${this.name} (${this.breed}) sủa: Gâu gâu!`);
    }
    wagTail() {
        console.log(`${this.name} đang vẫy đuôi!`);
    }
}
const animal = new Animal("Động vật");
animal.makeSound();
const dog = new Dog("Buddy", "Golden Retriever");
dog.makeSound();
dog.wagTail();
console.log(`dog là instance của Animal? ${dog instanceof Animal}`);
console.log(`dog là instance của Dog? ${dog instanceof Dog}`);
