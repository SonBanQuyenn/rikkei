class Animal {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    makeSound(): void {
        console.log(`${this.name} đang kêu...`);
    }
}

class Dog extends Animal {
    breed: string;

    constructor(name: string, breed: string) {
        super(name);
        this.breed = breed;
    }

    makeSound(): void {
        console.log(`${this.name} (${this.breed}) sủa: Gâu gâu!`);
    }

    wagTail(): void {
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