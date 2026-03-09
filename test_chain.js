const healing = { items: undefined };
try {
    const len = healing?.items?.filter(i => i).length ?? 0;
    console.log("Success", len);
} catch (e) {
    console.log("Error", e.message);
}
