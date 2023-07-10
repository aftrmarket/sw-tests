async function handle(state, action) {
    const balances = state.balances;
    const input = action.input;
    const caller = action.caller;

    if (input.function === "set") {
        // Sets contract IDs
        state[input.key] = input.value;

        return { state };
    }
    if (input.function === "transfer") {
        const target = input.target;
        const qty = input.qty;

        if (!Number.isInteger(qty)) {
            throw new ContractError('Invalid value for "qty". Must be an integer.');
        }

        if (!target) {
            throw new ContractError("No target specified.");
        }

        if (qty <= 0 || caller === target) {
            throw new ContractError("Invalid token transfer.");
        }

        if (balances[caller] < qty) {
            throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
        }

        if (!balances[caller] || balances[caller] == void 0 || balances[caller] == null || isNaN(balances[caller])) {
            throw new ContractError("Caller doesn't own a balance in the contract.");
        }

        // Lower the token balance of the caller
        balances[caller] -= qty;
        if (target in balances) {
            // Wallet already exists in state, add new tokens
            balances[target] += qty;
        } else {
            // Wallet is new, set starting balance
            balances[target] = qty;
        }

        return { state };
    }

    if (input.function === "balance") {
        const target = input.target;
        const ticker = state.ticker;

        if (typeof target !== "string") {
            throw new ContractError("Must specificy target to get balance for.");
        }

        if (typeof balances[target] !== "number") {
            throw new ContractError("Cannnot get balance, target does not exist.");
        }

        return { result: { target, ticker, balance: balances[target] } };
    }

    if (input.function === "allow") {
        target = input.target;
        const quantity = input.qty;
        if (!Number.isInteger(quantity) || quantity === void 0) {
            throw new ContractError("Invalid value for quantity. Must be an integer.");
        }
        if (!target) {
            throw new ContractError("No target specified.");
        }
        if (target === SmartWeave.contract.id) {
            throw new ContractError("Can't setup claim to transfer a token to itself.");
        }
        if (quantity <= 0 || caller === target) {
            throw new ContractError("Invalid token transfer.");
        }
        if (
            balances[caller] < quantity ||
            !balances[caller] ||
            balances[caller] == undefined ||
            balances[caller] == null ||
            isNaN(balances[caller])
        ) {
            throw new ContractError(
                "Caller (" + caller + ") balance not high enough to make claimable " + quantity + " token(s)."
            );
        }

        balances[caller] -= quantity;

        state.claimable.push({
            from: caller,
            to: target,
            qty: quantity,
            txID: SmartWeave.transaction.id,
        });

        return { state };
    }
    if (input.function === "claim") {
        const txID = input.txID;
        const qty = input.qty;
        if (!state.claimable.length) {
            throw new ContractError("Contract has no claims available.");
        }
        let obj, index;
        for (let i = 0; i < state.claimable.length; i++) {
            if (state.claimable[i].txID === txID) {
                index = i;
                obj = state.claimable[i];
            }
        }
        if (obj === void 0) {
            throw new ContractError("Unable to find claim.");
        }
        if (obj.to !== caller) {
            throw new ContractError("Claim not addressed to caller.");
        }
        if (obj.qty !== qty) {
            throw new ContractError("Claiming incorrect quantity of tokens.");
        }
        for (let i = 0; i < state.claims.length; i++) {
            if (state.claims[i] === txID) {
                throw new ContractError("This claim has already been made.");
            }
        }
        if (!balances[caller]) {
            balances[caller] = 0;
        }
        balances[caller] += obj.qty;
        state.claimable.splice(index, 1);
        state.claims.push(txID);

        return { state };
    }
    if (input.function === "claimA") {
        // Interaction to claim on contract A
        const claimResponse = await SmartWeave.contracts.write(state.a, {
            function: "claim",
            txID: input.txId,
            qty: 1,
        });
        if (claimResponse.type !== "ok") {
            throw new ContractError("Claim A failed.");
        }

        // If successful, push onto tokens[] and add claim for C
        state.tokens.push(state.a);

        state.claimable.push({
            from: input.caller,
            to: input.target,
            qty: 1,
            txID: SmartWeave.transaction.id,
        });

        return { state };
    }

    throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
